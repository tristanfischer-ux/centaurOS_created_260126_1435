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

| Signal | Value | Bar |
|---|---|---|
| `duty_torque_screen_ok` | **false** | Blocks A |
| FE mean \|T\| / required | **57.84 / 125.21 = 0.462** | Blocks A |
| **Honest delivered ratio** | **0.327** (signed mean −40.92, 24 of 37 points negative) | Blocks A |
| Ripple | ~**207%** p-p; torque REVERSES SIGN; `torque_reliable=false` | DEC-EM-1 |
| Oil screening | **CLEARED** (analytical cornering + gallery) | Helps A |
| Planetary strength writeback | **INVALIDATED** (`PLANETARY_STRENGTH_VS_ROTOR_BORE`) — paused until EM OD freeze | Blocks A |
| PCB | Draft / **NOT_FAB** | Honest |
| Geometry coherence | 41 blocking → **6** remaining (probe contamination residue) | Hygiene |
| Solver coverage | 3/18 → **18/19 FRESH** | Hygiene |

**Verdict:** on the correct Bar A critical path (EM honesty). Not close to Bar A pass. Bar B not closable in software.

> **IN FLIGHT AT COMPACT:** a re-run of `em_fia_front_kit_case.py` carrying BOTH panel fixes (advance sign + slot opening) was launched at ~09:42 BST, log `/tmp/em-both.log`, pre-run snapshot `/tmp/em-b10.json`. **Read the log and `cmp` the artefact before trusting any number above.** If the numbers moved, replace this table.

---

## 2. The EM story — how 4.34 became 57.84, and what the panel found

Every step was a **real bug**, each verified independently:

| Fix | Torque | Root cause |
|---|---|---|
| baseline | 4.34 | hardcoded 12-slot belt map valid only at 48 slots; at 24 it produced a 120°-periodic broken MMF (three belts never forming a rotating field) |
| swat_em winding | 31.76 | winding layout now solved, kw1 = 1.0, symmetric |
| turns 4 → 7 | 43.34 | `turns_per_coil=4` inconsistent with `turns_per_phase=14` |
| twin-derived slot count | **57.84** | slot count and phase-A MMF axis both derived, not assumed |

**Refuted by direct test** (do not re-litigate): rms/peak confusion (twin correctly 477 rms → 674.58 peak); missing sector multiplier (the LUA deck emits all 24 slots and 16 magnet blocks — genuine full 360°); truncated stress integral (splitting the airgap moved the answer 57.83 → 57.84, so the integral was **not** truncated).

### The 3-seat OpenRouter panel (`out/…/_em_review_v2/`)

Seats returned: `sol` (openai/gpt-5.6-sol), `grok45` (x-ai/grok-4.5), `kimi_k3` (moonshotai/kimi-k3). **GLM 5.2 never returned** — the 4th seat is still open.

Three faults they found, all fixed in `920abb552`:

1. **Advance sign backwards.** `+p·θm` gives signed mean −7.13; `−p·θm` gives +26.12. The rotor-frame current angle must counter-rotate.
2. **Slot opening 46% of slot pitch** (`slot_half_width_rad = slot_pitch_rad * 0.23`) — 6.9° mech at 24 slots. Real traction machines run semi-closed at 10–20%. Now `0.07` via `FIA_SLOT_OPEN_FRAC`.
3. **Duty screen fed `mean|T|`, not delivered torque.** `mean|T| = 57.84` while the signed mean is **−40.92** with 24 of 37 points negative. The honest ratio is 0.327, not 0.462. `summarize_rotor_position_sweep()` now emits `delivered_mean_torque_nm`, `sign_reversals`, `torque_sign_consistent`.

### ⚠ The slot opening is currently a MODEL fix

Narrowing the slot changed the FE deck only. **If narrowing it is what makes the machine work, that is a real design requirement for the physical stator lamination and it must reach the BoM and the drawings** — not just the LUA deck. This is unfinished work, not a closed item.

### If torque is still short after the re-run

Run the decisive experiment, already written and **never yet executed**:

```bash
.venv/bin/python scripts/motor-stack/em_fia_airgap_fundamental_probe.py \
  --twin out/formula-e-front-mgu-20260729-1432
```

Open-circuit airgap **fundamental** B1 against the 0.70–1.00 T healthy band. B1 healthy ⇒ the torque PATH is wrong. B1 weak ⇒ the MAGNETIC CIRCUIT is wrong (magnet vectors, material, pocket geometry, slot openings shunting flux) and no winding or integration work will help. The two conclusions demand completely different fixes — that is why it is worth a dedicated run.

Also unexecuted: EM brief v2 §6 step 1, the **linear-material FE run** (fix µr, drop the BH curve). If linear FE ≈ 131 N·m the gap is saturation and the machine is genuinely short; if it stays ≈ 58 N·m the integration is still wrong.

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
