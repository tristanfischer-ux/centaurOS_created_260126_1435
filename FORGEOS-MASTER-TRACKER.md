# ForgeOS — MASTER TRACKER (single source of truth)

> **This is THE list.** Read it at the start of every work increment; update it after every one.
> Supersedes the scope-slice trackers (BLENDER-UNIVERSAL-LOOP-TRACKER.md, ANVIL-*). Those stay
> as detail logs; THIS file is the whole job. Last updated: 2026-06-11.

## ⭐ The aim (hold every turn)
A **universal** engine that turns ANY engineering brief into a **complete, optimal, manufacturable
dossier** — Part 1 (engineering), the CAD model, the **8 design-and-construction drawings**, Part 2
(**how you manufacture it + the bill of materials**) — scoring **≥8 on EVERY section**, **self-
correcting**, and the optimisation loops **converged** (engineering AND Blender), with **all of it
rendered into the PDF**, not sitting in /tmp.

## 🎯 CURRENT FOCUS
Autonomous, 2 sub-agents max (Anthropic rate-limit, Tristan 2026-06-11). RUNNING: D1 universal auto-BFD
(`draw_bfd.py`) + W8.2 BoM cost-grounding (`bom-cost-grounding.ts`) — both build-only, I integrate.
✅ DONE this turn: W2.1 (drawings in PDF, pages 37-39) + W8.1 (universal-CAD hero fills cover/module gap)
— verified end-to-end via the production path (manifest.hero → state.cad_hero_image_path → render).
NEXT after integration: wire the BFD into EngineeringBasisPage; wire cost-grounding into the chain;
then W4.1 (CAD cable/pipe quantities into the BoM).

## ▶ NEXT 3 (in order)
1. **W2.1** Get the 8 drawings into the rendered PDF (investigate render integration point → wire → verify a real dossier shows them).
2. **W4.1** Part 2 / bill of materials: merge the distribution BoM (cables/pipes/ducts + economic saving) into the dossier BoM.
3. **W3.2** Instrument the optimisation loops to REPORT rounds-to-converge — engineering (convergence_loop) AND Blender (render→critique→improve). Answer Tristan's "how many rounds?".

---

## WORKSTREAMS (status: ✅ done · 🔄 active · ⏳ queued · ❌ not started)

### W1 · Universal Blender CAD scene builder ✅ (mature; polish ongoing)
- ✅ 5 geometry families + generic-assembly fallback (~40 archetypes), INSPECT light-mode render.
- ✅ Pipe-rack routing, role-based flow derivation, real connection sizing (`connection_sizing.py`).
- ✅ Phase-D auto-upsize, D2 sub-distribution actuation, costed distribution BoM.
- ⏳ W1.x polish families to 10/10 each (robotics/marine/device still sensible-fallback). [orig loop]
- Files: `scripts/blender-universal/build_universal_scene.py` (+ `connection_sizing.py`).

### W2 · The 8 design-and-construction drawings 🔄 (BUILT, NOT in the PDF) — LEAD-AND-WEAVE
- ✅ All 8 generators built + self-verified: cable schedule, single-line diagram, P&ID, panel/load
  schedule, GA, process schedules (line/valve/instrument), HVAC layout, piping isometrics.
- ✅ Cross-referenced by identical tags (203-ST-DN200 same on P&ID + line list + iso).
- **Placement (Tristan 2026-06-11): LEAD-AND-WEAVE.** 3 SYSTEM drawings (GA, single-line, P&ID) OPEN
  Part 2 as the design anchor; 5 schedules/details (cable schedule, panel schedule, process schedules,
  isometrics, HVAC) WEAVE in-line with the manufacturing-layer content they back.
- ❌ **W2.1a — driver** `generate_drawing_set.py`: dossier state.json → 8 drawing PNGs in `<outDir>/drawings/`
  (run build_universal_scene.py if the schedule/route artifacts are absent, else reuse; then the 8 draw_*.py).
- ❌ **W2.1b — chain step**: generate the drawings during the run (after the engineering contract is ready).
- ❌ **W2.1c — renderer**: 3 system drawings open Part 2; 5 schedules weave into the W4 manufacturing layer.
- ❌ **W2.1d — verify** on a real dossier PDF (open it, see all 8 placed right).
- Files: `scripts/blender-universal/draw_*.py` (+ new `generate_drawing_set.py`).

### W4 · Part 2 manufacturing layer (Option A EVOLVE) 🔄 — the drawings' table-form twin
- ❌ **M1 make-vs-buy** — classify each BoM word bought-off-shelf / fabricated / custom-made (derivable:
  real MPN+manufacturer ⇒ buy; bespoke/fabricated marker ⇒ make). Backs cable/process schedules.
- ❌ **M2 process route** — per MADE item, how it's manufactured (machined/fabricated/cast/PCB/wound).
  Backs the P&ID + isometrics.
- ❌ **M3 assembly sequence** — build order parts → sub-assemblies → modules → system (from module
  hierarchy + topology). Backs the GA.
- ❌ **M4 cost-of-goods build-up** — unit COGS = materials + labour + process + overhead, built on
  `process-equipment-cost.ts` (DOE/NETL curves) — NOT LLM guesses. The "cost of goods sold" gap.
- Extend, don't duplicate: `sourcing-strategy.ts` already does who-makes-it (contractor scopes).

### W3 · Convergence + optimisation loops 🔄 (BUILT, not wired, round-count not reported)
- ✅ Physics↔CAD convergence loop (`convergence_loop.py`) — fixed point, contraction proof, 2-4 iters.
- ✅ Economic-conductor optimiser + layout-length 2-opt (`design_optimisation.py`).
- ✅ `economic_distribution_summary` — the saving as a reportable artifact.
- ❌ **W3.1 — wire the loops into the pipeline** (emit convergence-report.json + economic-optimisation.json per run; feed optimised sizes downstream).
- ❌ **W3.2 — instrument rounds-to-converge (Tristan's "how many rounds?")** — engineering loop already
  reports `iterations`; the BLENDER visual loop needs a deterministic quality score + a round counter
  so "render → critique → improve" has a measured convergence, not a vibe.
- Files: `scripts/blender-universal/{convergence_loop,design_optimisation}.py`.

### W4 · Part 2 — manufacturing + bill of materials 🔄 (the big one; Tristan flagged)
- ❌ **W4.1 — distribution BoM into the dossier BoM** (`merge_distribution_bom()` is the ready hook;
  cabling/piping/ductwork has historically been OMITTED entirely from the dossier BoM).
- ❌ **W4.2 — economic-conductor saving shown in the BoM** (`economic_distribution_summary` ready).
- ❌ **W4.3 — Part 2 "how you manufacture it"** — the manufacturing-method / process narrative.
- Files: `connection_sizing.py::merge_distribution_bom`, chain BoM stage, Part-2 render.

### W5 · Universal CAD quality → 10/10 per archetype ⏳ (the original loop, partial)
- ✅ process-plant, rack-farm (battery/compute), panel-array, aero (aircraft/spacecraft), tower, fallback.
- ⏳ polish each family to a verified 10/10; perfect archetype-1 → next → … (Tristan's sequencing).
- Detail log: `BLENDER-UNIVERSAL-LOOP-TRACKER.md`.

### W8 · GROUND THE DOSSIER IN THE NEW PHYSICS + CAD (Tristan 2026-06-11) 🔴 (core gap)
The new physics engine + universal CAD are largely DISCONNECTED from what the dossier shows. Tristan's
two questions exposed this. Close it:
- ❌ **W8.1 — new Blender renders into the dossier.** Dossier reads pre-baked `public/heroes/<slug>-*.png`;
  the new universal CAD (build_universal_scene.py) renders any archetype from the real engineering but
  isn't wired in. e_fuel_synthesis isn't even slug-mapped → e-fuel shows NO 3D image. Wire the universal
  CAD hero/per-module/exploded renders in (+ slug-map e-fuel). Caveat: a procedural Blender approach was
  rejected 2026-06-10 on quality — verify each family's render is dossier-grade before swapping a good
  template; e-fuel (no current image) is a strict win.
- ❌ **W8.2 — BoM PRICE grounding.** Real e-fuel dossier: 70/73 lines are LLM-authored price guesses
  (provenance "unknown"), only 3/73 a live distributor price, 0 corpus. Replace LLM guesses with the
  DOE/NETL Class-4 cost curves already in `scripts/lib/cost/process-equipment-cost.ts` + live distributor
  cache. (= W4/M4 cost-of-goods.) Quantities ARE physics-grounded (registered engineering contract); the
  PRICE is the weak link.
- ❌ **W8.3 — BoM grounded in the CAD** = W4.1 (routed cable/pipe quantities from the connection schedule
  into the BoM; today cabling/piping/ductwork is omitted entirely).

### W6 · Bill-of-materials DATA coverage / growing-DB ⏳ (the AIM's real long pole)
- The pretraining DB must self-generate per-class branded parts on the fly (DB-first → web/own-training
  on miss → verify → writeback). Foundational for ≥8 BoM on unseen archetypes. [the-aim]
- Largely a DATA problem, not code. Tracked here so it is never forgotten under the code work.

### W7 · Tracking discipline 🔄 (this file)
- ✅ Master tracker created 2026-06-11 (this file).
- 🔄 Keep it current: read at increment start, update after. Reconcile the stale TaskList.

---

## 🐞 KNOWN DEFECTS (tagged — must NOT slip again)
- **D1 — Part-1 "1 · Process flow" is a degraded box-list for every class except CO₂** (Tristan flagged
  2026-06-11, "it should be a nice flow diagram — slipped through the gaps"). In `render-minimal-pdf.tsx`
  EngineeringBasisPage (~line 16276) the proper diagram (`Co2ProcessFlowDiagram` — equipment + drawn
  streams + dashed recycle + quantities) is gated on `isCo2Flow`; ONLY co2-mineralisation gets it.
  e-fuel + all others fall through to `modules.map(...)` box-list with 3 faults: (a) inter-module STREAMS
  NOT DRAWN ("annotated below (not drawn)"); (b) modules render in STORED order → jumbled (M5→M1→M3→M2→M4→
  M8→M7→M6, not process order M1→M2→…); (c) wrong input label (e-fuel shows "Flue gas (CO2 source)" but
  feeds CO₂+H₂). ROOT CAUSE: the "universal auto-BFD generator" was deferred as "a separate build"
  (comment line ~15928, 2026-06-08) and never built; the CO₂ one was hand-built. FIX IS NOW TRACTABLE:
  the topology (the "8 routed inter-unit connections") + this session's flow-ordering + the new
  `draw_pid.py` (a universal process-flow diagram FROM the topology) provide exactly what a universal
  auto-BFD needs. Build it OR back the section with a simplified topology-driven block-flow; at minimum
  process-ORDER the modules + draw the inter-module arrows + fix the input label.

## DONE LOG (this arc — newest first)
- `9be4c88cf` economic_distribution_summary (saving as a BoM artifact)
- `431d94531` convergence loop + economic-conductor & layout optimisers (45 checks)
- `5ffb81777` piping isometrics + route export — drawing set #8, SET COMPLETE
- `118ac1da1` HVAC layout (#7) · `b4f8e8515` process schedules (#6) · `c1c09779d` GA (#5)
- `07e703401` panel schedule (#4) · `340ffdebc` P&ID (#3) · `4cdc0ccca` single-line (#2)
- `8ef37b417` connection sizing engine · earlier: 5 geometry families + routing + Phase D/D2

## DECISIONS · CONSTRAINTS · CORRECTIONS
- **2026-06-11 — Part 2 = OPTION A "EVOLVE"** (Tristan). Keep modules/sub-modules/BoM spine; ADD a
  manufacturing layer (make-vs-buy · process route · assembly sequence · cost-of-goods build-up),
  ADDITIVELY (his 2026-06-04 hard rule: in-context BoM stays, masters are additive never replacements).
  Foundations already exist — `sourcing-strategy.ts` (who-makes-it: main-contractor + subcontractor
  scopes; core-chain step 5) and `scripts/lib/cost/process-equipment-cost.ts` (DOE/NETL-2002/1169
  Class-4 cost curves, material rate, fabrication factor, skid-vs-stick install factor). Cost-of-goods
  MUST build on those real curves, NOT LLM guesses (the CO₂ dossier burned on LLM-authored prices; a
  gate-32 aggregate PASS ≠ defensible per-line cost). Map: `PART2-ARCHITECTURE-MAP.md`. Pre-change
  mempalace search done → 6 drawers (dossier 3-part structure, core value chain, two cost pipelines,
  CO₂ cost-defensibility, DOE/NETL curves, assembly-dedup).
- **Dossier is already THREE parts** (commit 8be0d7512): Part 1 engineering · Part 2 "how to build it"
  (modules + in-context BoM + risk) · Part 3 "Reference & procurement" (master BoM, suppliers,
  economics, sourcing, engagement). The manufacturing layer + drawings land in Part 2.
- **8 drawings placement — OPEN (asked Tristan 2026-06-11).** They pair with the manufacturing layer.
- **2026-06-11 — NO other terminals on this project** (Tristan). The "foreign-dirty / don't edit
  serial-design-chain-v2.tsx" rule was a WRONG premise — the dirty set is 37 trivial lines, last
  committed by Tristan 4 days ago. The chain IS mine to edit. This unblocks W2.1 + W4.
- Drawing generators currently write to /tmp; W2.1 moves them into the PDF render path.
- Push with `--no-verify` only if pre-existing unrelated test failures block (verify they're not mine).
- Commit + regression-guard every change (project rule); update THIS tracker each increment.

## OPEN QUESTIONS (for Tristan when convenient)
- Q1: Part 2 "how you manufacture it" — depth wanted? (process route + make-vs-buy + key process
  steps, or full manufacturing-process sheets?) — default: process route + make/buy + BoM first.
- Q2: rounds-to-optimise target — is the goal "report the count" or "drive a fixed N every run"?

## 🐞 D2 — INSPECT render pipework still reads "odd" (Tristan 2026-06-11, iteration work)
The de-cage fix (1faac282d) resolved the "real mess" (cage gone, well-framed via inspect-hero). Tristan:
"not a mess but not great from a pipework perspective — still looks odd". ITERATION WORK (not blocking).
Render kept PULLED from the dossier (2D-drawing-led) until the pipework iterates clean, then re-feature.

## ♻ COST-SYSTEM RECONCILE — ✅ DONE 2026-06-11 (build-cost-basis now universal)
TWO DOE/NETL cost systems now exist: (1) `scripts/lib/cost/build-cost-basis.ts` — PER-CLASS
(CLASS_EQUIPMENT_MAPS only covers co2_mineralisation), builds `state.costBasis` (cost_gbp + `defensible`
flag) but ONLY DISCLOSES on the Cost Methodology page, never writes back to the BoM. (2)
`scripts/lib/cost/bom-cost-grounding.ts` (W8.2, mine) — UNIVERSAL (any class), AND writes back
(chain stage overwrites partVerifications prices). Both build on process-equipment-cost.ts. NOT pure
duplication (mine is universal where build-cost-basis is co2-only) but they overlap.
CLEAN MERGE (follow-up, not done): make build-cost-basis UNIVERSAL by using bom-cost-grounding's detection
as its no-class-map fallback → ONE source of defensible prices that feeds BOTH the methodology page AND
the writeback. Then drop the separate bom-cost-grounding chain stage. Lesson: pre-change mempalace/grep
for existing cost logic BEFORE building a cost module (I missed build-cost-basis).

**Reconcile landed (commit pending): build-cost-basis.ts now delegates UNMAPPED lines to bom-cost-grounding's universal detection over the SAME DOE/NETL curves — ONE cost engine, all classes. e-fuel went 0→11 defensible cost-basis lines; co2 unchanged; build-cost-basis.test 21/21; methodology page shows defensible for any class. Remaining (minor): the chain has my cost-grounding writeback stage (6113) AND build-cost-basis (6339) both calling groundBomLineCost — to fully dedup, move the writeback after build-cost-basis and read state.costBasis. Not divergent (one engine); just a redundant call.**
