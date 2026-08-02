# Terminal Compact Handover — FE Front Powertrain Kit (FPK)

**Written:** 2026-08-01 (Claude Code / terminal, campaign owner)
**Merges:** Cursor's [`CURSOR-TERMINAL-COMPACT-HANDOVER-FE-FRONT-FPK-2026-08-01.md`](./CURSOR-TERMINAL-COMPACT-HANDOVER-FE-FRONT-FPK-2026-08-01.md) (its §0 constraints, §4 engines cheat-sheet and theatre list, §5 paste block are folded in below).
**Supersedes for scoreboard:** the 2026-07-31 Cursor→Claude handover. Its **~118 N·m EM figure is STALE** — trust this file and the live twin.

---

## 0. Hard constraints (verbatim — do not violate)

| Rule | Value |
|---|---|
| Twin (**ONLY**) | `out/formula-e-front-mgu-20260729-1432/` — **do not mint a new front-kit out dir** |
| Branch | `oxccu-efuel` |
| `ship_ok` | Always **false** until Bar B hardware evidence |
| Homologation | **NOT_HOMOLOGATED** |
| Fix style | SOURCE rule + proveCatch — never band-aid one twin's JSON |
| Gold / Lucid | Training check only — never paste proprietary STEP / silhouette |
| Product images | CAD → Cycles only — **no** LLM product polish |
| Duty screens | Never clear a duty on peak alone |
| Oil screens | Must not regress: 30 mm slosh / Ø1.8 mm jet / ~626.4 ml |
| Bar B artefacts | Do not invent dyno / HIL / Gerbers / XYZ |
| Blender ownership | **TERMINAL** (Cursor handed it back, commit `8f40fd96f`) |
| SIGHT | Open delivered PNGs / twin JSON with eyes. Logs ≠ done |

---

## 1. Live scoreboard

> ⚠⚠ **HOLD — every torque figure below is provisional.** pyleecan says the FE
> builds a 28-series-turn machine where the contract specifies 14 (FE λ_pm /
> analytic = 1.964 on the near-sinusoidal rebalanced field). If that carries to
> torque, all of it halves and DEC-EM-1 reverses. Measurement in flight. See
> `DEC-EM-1-DECISION-BRIEF-2026-08-01.md` §HOLD.


**DEC-EM-1 is RESOLVED by measurement** — see
[`DEC-EM-1-DECISION-BRIEF-2026-08-01.md`](./DEC-EM-1-DECISION-BRIEF-2026-08-01.md).

| Signal | Baseline (twin as it stands) | Rebalanced (the decision) |
|---|---|---|
| delivered torque / 125.21 required | 47.42 N·m = **0.379×** | **145.73 N·m = 1.16×** |
| torque sign across a pole pitch | crosses zero 4× | **never crosses zero** |
| excitation tracking k1/k2 | 14.3 / 21.4 | **0.0 / 0.0** |
| λ_pm fundamental | 0.002903 Wb | **0.031057 Wb** |
| linkage THD | 198.2% | **6.9%** |
| demag margin @160 °C, 477 A rms | ×4.79 | **×3.25 (OK)** |
| `duty_torque_screen_ok` | **false** | **false** — `torque_reliable` hardcoded false pending dyno |
| `ship_ok` | **false** | **false** |

**The decision: magnet respec alone** — t 8.85 → 6.0 mm, L 14.58 → 22.5 mm.
No stack change, no housing change, no rotor OD change, so the planetary
strength writeback is untouched.

**The cause, one fact:** magnets spanning 56% of the pole pitch, bunched at ±11°
of a 45° pole, make a flux PULSE whose 3rd harmonic is 1.90× its fundamental.
The 3rd is zero-sequence and produces NO torque. Widening the arc converts that
dead energy into fundamental — a measured 10.7× flux gain where the area ratio
alone predicts 1.46×.

### ⚠ Every torque number quoted before 2026-08-01 evening is VOID

118, 93.6, 57.84, 64.6, 48.8, 112.458 — all superseded. The first four were
rectified means over a machine whose excitation was never in synchronism; 48.8
was measured before the pole arc was understood; 112.458 was measured at γ=0,
which is not the optimum. Do not quote or compare against any of them.

### The twin holds the BASELINE, deliberately

`_motor_stack/em_fia_front_kit_case.json` describes the 8.85 mm machine, because
the DESIGN is still baseline until DEC-EM-1 is executed. The rebalanced result
lives in `em_fia_front_kit_case_REBALANCED.json`. Do not conflate them — a probe
value left in state becomes the design value.

## 2. The EM story

### The winding chain — real bugs, each verified, all still valid

| Fix | Root cause |
|---|---|
| swat_em winding | hardcoded 12-slot belt map valid only at 48 slots; at the twin's 24 it produced a 120°-electrical-periodic broken MMF — three belts that never formed a rotating field |
| turns 4 → 7 | `turns_per_coil=4` inconsistent with `turns_per_phase=14`; 7 is what the contract's own turns_per_phase implies |
| twin-derived slot count | slot count and phase-A MMF axis both derived from the solved layout, not assumed |

The torque figures those steps produced (4.34 → 31.76 → 43.34 → 57.84) are
**void** — see the warning in §1. The FIXES are sound; the numbers measured a
mis-excited machine.

**Refuted by direct test — do not re-litigate:** rms/peak confusion (477 rms →
674.58 peak, applied correctly); missing sector multiplier (the LUA deck emits
all 24 slots and 16 magnet blocks — a genuine full 360° model); truncated stress
integral (splitting the airgap moved the answer 57.83 → 57.84); √6 current
under-application (`phase_current_peak_a` is exactly 477·√2, no √3 anywhere);
poles-vs-pole-pairs in the advance rate (with `p`=4 the async bins go to zero;
with `2p` they would not).

### The three faults the panel gave me — how they actually resolved

| panel fault | outcome |
|---|---|
| advance sign backwards | **REAL, but I flipped it the WRONG WAY.** Settled by measurement: 37 points over a full pole pitch, both signs. `−p·θm` gives async k=1/k=2 of 53.65/80.17 N·m; `+p·θm` gives **0.01/0.01**. Four orders of magnitude. Default is now `+`. |
| slot opening 46% → 14% | **WRONG, and my error not theirs.** `slot_half_width_rad` spans `r_slot_inner`→`r_slot_outer`: it is the FULL SLOT. This deck has no mouth geometry, so a semi-closed slot cannot be expressed in it at all. Setting 0.07 shrank the whole slot to 14% of pitch, cutting copper to under a third at unchanged current and leaving 86% of pitch as tooth — a 104 N·m slot-periodic swing that read convincingly as cogging. Reverted to 0.23 (46% full width, a normal 46/54 split) and renamed `FIA_SLOT_WIDTH_FRAC`. |
| duty screen fed `mean\|T\|` | **REAL and kept.** The screen now binds on the DELIVERED mean and on `excitation_tracking_ok`. |

The panel's slot advice was *true about real machines*. I applied it to a
parameter that means something else without reading what it built. See
`scripts/lib/model_routing.py`: no model validates physics (CritPt ceiling 32%).

### Three more source bugs, in the angle screen

Found after the excitation closed, all of which made the machine look worse:

1. **Solved each angle at rotor position 0 only** — ranking on `DC + cogging(0)`,
   and cogging is 76.8 N·m. Position 0 read +55.01 while the true mean was
   −43.13. Measured single-position error up to **99.2 N·m**.
2. **Ranked on `abs(torque)`** — a large braking point wins.
3. **Angle list was entirely negative** (−40…−90). With the sign corrected the
   optimum sits in the other half-plane, so the search space excluded the answer.

Fixed by ranking on a cogging-cancelled mean over three positions a third of a
slot pitch apart (annihilates the cogging fundamental and its 2nd harmonic
exactly), spanning both half-planes. Best angle −30° elec.

### The remaining contradiction — and the probe that settles it

Same deck, same mesh, same machine:

| route | value |
|---|---|
| back-EMF 324.06 V l-l rms | **131.11 N·m** |
| analytic design flux (flux-focusing corrected) | **126.95 N·m** |
| FE torque integral, excitation synchronised | **48.8 N·m** |

Saturation and an ampere-turns scale error are indistinguishable at design
current. `scripts/motor-stack/em_fia_torque_scaling_probe.py` separates them: at
LOW current the iron does not saturate, so `T = 1.5·p·λ_pm·I_q` must hold exactly
with λ_pm from the deck's own back-EMF. **A ratio flat in current is a SCALE
error** (2.0 ⇒ the parallel-path division is missing — with Npcp=2 each conductor
carries I_phase/2, and the deck applies turns=7 with the full phase current).
**A ratio that moves with current is SATURATION.**

Both Grok 4.5 and DeepSeek V4 Flash independently named the missing
turns/parallel-path table as the blocker. Do not resolve it by argument.

---

## 3. Tool-selection audit — the finding that matters beyond this campaign

Tristan: *"why you're not using any of the deterministic stack engines… is it Claude making these choices, which seems random, or is it a deterministic selector which might be restrictive?"*

Answer: **both, badly.** 348 engine files exist; only **3 of 18** twin-facing solvers were being used. The class-whitelist `applicable_to(envelope)` was the restrictive half; my own ad-hoc reach for a hand-rolled script was the random half. Four times in one session I **built instead of looked**.

Built to close it (all with `--selftest` proveCatch):

| File | What it proves |
|---|---|
| `scripts/lib/fpk_solver_coverage.py` | discovers solvers by `--twin` entrypoint; the selftest **forbids a hardcoded roster** |
| `scripts/lib/fpk_capability_gap_resolver.py` | DB-first, existing-solver-wins; absent PRIMARY package ⇒ NEEDS_INSTALL; `GENERIC_NUMERICS` (numpy/scipy/sympy) do **not** count as a capability |
| `scripts/lib/orchestrator/generic/iterative-tool-discovery.ts` | fixpoint over the duty set; selftest proves 2-hop discovery (tools that only become relevant after earlier tools run) |
| `scripts/fe-front-gap-literature-search.tsx` | hybrid **vector + keyword** retrieval via `dualSearch`, replacing my naive filename token-overlap |

Capability sweep gives **19/185** applicable vs the whitelist's 16/185, rescuing `gearbox-load:spectrum`, `magnetics:coil-rl-risetime`, `ngspice:pcs-simulation`, `cable:ampacity`, `thermal-envelope:ladder`, `enclosure-emc:margin`.

**Three of my own dualSearch bugs, each of which read as "the corpus is empty":** guessed column names (`claim_text`/`title` do not exist → 0 hits); never passed the `embedding:` config (32,118 of 32,453 rows in `fpk_extracted_claims` *are* embedded); hits nest under `.row`, not the top level. `fpk_component_literature` (24,946 rows) has **no embedding column** — that is a real corpus gap and embedding it is follow-up work.

---

## 4. Blender — delivered, and what is still soft

Owned by terminal again. `14-product-parts-catalogue.png` is the "all the parts almost laid out on a big piece of paper" sheet: **97 labelled cells, 188/188 parts reconciled, `coverage_ok=True`.**

Root causes fixed (each was a different bug wearing the same symptom):

- **Cutaway read as a black box** — not the section pass, which was correct. `u_se_td_winding_end_{0,1}` were solid full-diameter discs capping both motor ends. Now annular (r 100.5 → 115.1 mm); `08` shows the planetary nest through an open bore.
- **Rings rendered edge-on** — `obj.dimensions` is the LOCAL bbox and ignores rotation. Axis-aligned boxes looked fine while every rotated cylinder turned edge-on. Fixed with world-aligned extents.
- **Planet gear rendered as parallel stripes** — the gear cap was one ~750-vertex concave n-gon that `bm.faces.new` silently refused; the stripes were its inner side walls. Fixed with a triangle fan.
- **Blender exits 0 when its `--python` script dies** — `BLENDER_FAIL_FLAGS = ("--python-exit-code", "1")`, proven by a selftest against the real binary.
- Teeth are now solved, not decorative: `scripts/lib/fpk_gear_teeth.py :: solve_planetary_tooth_set()` enforces ratio = 1 + z_ring/z_sun, meshing z_ring = z_sun + 2·z_planet, equal spacing, and the 17-tooth undercut limit. Live kit solves m = 0.6, z_sun 20 / z_planet 64 / z_ring 148.

Cursor's hand-back (`8f40fd96f`) corrected my `ring_id − 4` vs meshing-rule inconsistency via `_fpk_meshing_ring_pcd_mm`, fixed my `r_root*1.14` internal-gear hub, flat-shaded the tooth flanks, fixed lighting that flattened m = 0.6 mm teeth, and reworked `13-product-exploded` into an engineering explode along pack +X.

**Residual (SIGHT before touching):** m = 0.6 mm teeth are still fine at whole-kit framing; sphere-proxy authenticity remains. Open `00-hero`, `08-product-ghost-shell`, `13-product-exploded`, `14-product-parts-catalogue`.

---

## 5. Gotchas earned this session (each cost real time)

- **A watcher whose `pgrep -f <pattern>` matches its own shell never fires.** It cost a full run: the "both fixes" EM re-run was reported as in-flight and had in fact never launched. Watch a **PID** (`while kill -0 $PID`) or break the literal (`[e]m_fia`). Always confirm the log file exists after launching.
- **An artefact outlives a failed run** (3 occurrences). Snapshot + `cmp` before/after, and assert a field your change should have altered.
- **`ast.parse()` does not catch symbol-table errors** — `global` used before declaration parses fine and dies at Blender runtime. Use `compile()`.
- **Never substring-replace a token**: `MM_` corrupted `VIEWING_DISTANCE_MM_DESIGN`.
- **A probe value left in state becomes the design value.** `stack_length_mm = 205` silently propagated into every artefact solved afterwards; it is the source of the 6 remaining geometry-coherence findings.
- **Hand-patching a derived quantity is always reverted** by the next re-derivation. `fpk_*` carry `basis: calculator`; the driver is `rotor_airgap_diameter_mm`.
- **OpenRouter emits whitespace keep-alive padding** while a slow model thinks; a truncated body fails as a misleading `Expecting value: line 253`. Strip, locate the first `{`, retry ×3. And **reasoning models spend the budget thinking** — Kimi K3 exhausted `max_tokens=8000` mid-derivation and never emitted JSON. Now 40000.
- **A splice between a function and the next `def` eats the constant block between them** (happened twice).

---

## 6. P0 queue after wake (ordered)

```
1. Read /tmp/em-both.log; cmp the artefact vs /tmp/em-b10.json. Report the
   DELIVERED mean (not mean|T|), sign_reversals, ripple.
2. If still short: airgap fundamental probe, then the linear-material FE run.
3. Produce DEC-EM-1 (freeze vs redesign) as a decision table with options.
4. Feed the slot-opening change back as a DESIGN requirement — BoM + drawings,
   not just the FE deck.
5. Re-stamp multiphysics: blockers are still judged on pre-fix numbers.
6. Clear the 6 geometry-coherence findings (stack=205 probe contamination).
7. Only after EM OD freeze: re-open planetary (KISSsoft/Romax-class LTCA).
8. Parallel, does not block DEC-EM-1: LTspice DPT + cantools DBC / Renode.
9. Embed fpk_component_literature (24,946 rows, no embedding column).
10. Re-seat GLM 5.2 on the panel.
11. Dual-write MemPalace + MEMORY.md. Reply in CURSOR-HARNESS-INBOX.md.
```

**Bar A minimum pass (do not declare early):** duty torque screen true **and** `torque_reliable` true **and** planetary writeback re-validated on the frozen EM OD **and** oil stays CLEARED **and** the blockers stamp is honest. An empty `[]` blockers array while `duty_torque_screen_ok=false` is **not** clearance.

**Bar B:** dyno / HIL / Gerbers / XYZ / oil free-surface / NVH / FIA — software can prepare, never mint.

---

## 7. Engines cheat-sheet (from Cursor's catalogue)

**Used:** xfemm/femmcli (FE mean ~58 N·m; saturation-vs-linear gap is real) · swat_em (the winding was a genuine bug, +7.3×) · ISO 6336 screens (planetary vs bore → INVALIDATED, correctly) · CoolProp/ht, OpenFOAM scaffolding, CalculiX, ROSS (screens only) · Blender/Cycles (morphology SIGHT) · atopile/KiCad (NOT_FAB honesty).

**pyleecan note:** its magnetic solvers are `MagFEMM` (needs the Windows FEMM binary via Wine) and `MagElmer` (needs Elmer). Neither is on this machine, so the pyleecan FE route is closed here — `em_pyleecan_analytic_crosscheck.py` takes the **analytical** route instead, which is the stronger check anyway because it derives torque from flux linkage, measurable independently.

**Unused-but-should (GPT + Kimi consensus):** one industrial EM path (JMAG *or* Motor-CAD+Maxwell) · pymoo/OpenMDAO around FE for a DEC-EM-1 Pareto · KISSsoft/Romax after EM freeze · LTspice DPT + FastHenry → PLECS for SiC honesty · OpenFOAM VOF or Particleworks for oil free-surface after gear freeze · cantools + Renode now, Typhoon later.

**Theatre — do not:** 3D EM before torque closes · NVH campaigns now · SPH splash videos · swapping FEMM↔JMAG-2D expecting the shortfall to vanish · enlarging gears in Blender to "see teeth".

---

## 8. Wake read list

```
docs/plans/TERMINAL-COMPACT-HANDOVER-FE-FRONT-FPK-2026-08-01.md   (this file)
docs/plans/CURSOR-TERMINAL-COMPACT-HANDOVER-FE-FRONT-FPK-2026-08-01.md
docs/plans/FE-FRONT-FPK-TERMINAL-BAR-AB-ENGINE-CATALOGUE-2026-08-01.md
docs/plans/FE-FRONT-EM-TORQUE-REVIEW-BRIEF-v2-2026-08-01.md      (§5–6 first)
```

Then `mempalace search "FE Front FPK" --wing forgeos` and the native MEMORY RECENT entries for 08-01.

**MemPalace pointers (Cursor's):** `drawer_forgeos_decisions_b12f5c78ae9e672a` · `drawer_forgeos_reference_1761c8d7c46426f0` · `drawer_forgeos_gotchas_e1e8396db547332f` · `drawer_forgeos_decisions_5c257992cae3a9f0`

## 9. Commits this session

```
dded7cc9a  parts catalogue + cutaway fix
ca661aead  rotor-frame position sweep
c8e395131  Blender primitives (involute gear, bearing, bolt, flange, busbar, stepped shaft)
00f4b2b2b  swat_em winding layout
99b475ed7  torque-integration — airgap split into the weighted-stress block
8f40fd96f  Cursor's Blender SIGHT pass (hand-back)
920abb552  advance SIGN + slot opening + delivered-torque metric — the 3 panel faults
```

## 10. Commands

```bash
# EM re-run (the one in flight at compact)
.venv/bin/python scripts/motor-stack/em_fia_front_kit_case.py \
  --twin out/formula-e-front-mgu-20260729-1432

# The decisive unexecuted test
.venv/bin/python scripts/motor-stack/em_fia_airgap_fundamental_probe.py \
  --twin out/formula-e-front-mgu-20260729-1432

# Independent analytical cross-check (3 torque routes)
.venv/bin/python scripts/motor-stack/em_pyleecan_analytic_crosscheck.py \
  --twin out/formula-e-front-mgu-20260729-1432

# Coverage + coherence
.venv/bin/python scripts/lib/fpk_solver_coverage.py --twin out/formula-e-front-mgu-20260729-1432
.venv/bin/python scripts/lib/fpk_geometry_coherence.py --twin out/formula-e-front-mgu-20260729-1432

# SIGHT
open out/formula-e-front-mgu-20260729-1432/{00-hero,08-product-ghost-shell,13-product-exploded,14-product-parts-catalogue}.png
```
