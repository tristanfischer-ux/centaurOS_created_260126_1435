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

## 🎯 CURRENT FOCUS — W9 · COST MUST SCALE WITH PRODUCTION (Tristan's 2× test, 2026-06-12)
The 2× SAF scale-up (OXCCU-SAF-2X-BRIEF.md, 2,000 t/yr) PROVED rendering/coordination is solid (17/17
coordination gate, all Part-2 subsystems, clean cover, scale-consistent prose) — AND exposed the core
defect: **the dossier cost is ~blind to production rate (a 2× plant is costed 1.04×)**. Rigorous, same-code
(1× vs 2× control runs): installed £14.08M→£14.67M, total_system_mass 1.26×. Process physics scales perfectly
(every flow/power 2.00×); EQUIPMENT mass + BoM cost don't. **3-layer root cause** (drawer
forgeos_gotchas_bc02fad34b716b71): L1 `q(c,KEY,DEFAULT)` frozen sizing reads (gate built `audit-sizing-scale.ts`,
e-fuel fixed 3f7157d29); L2 mass-aggregator HARDCODED buckets (e-fuel fixed a62602798 — derive from throughput);
**L3 (DOMINANT, not fixed): all 73 BoM lines get an emitter-pinned FLAT `list_price_gbp`, only 11 re-priced by
size-scaling grounding → cost won't track production until the deterministic emitter scales BoM
quantities+sizes with throughput (CORE change, all classes).** Tristan steered "bottom-up: derive every bucket
from throughput". L1-L2 done; **L3 is a core-emitter change — scope before editing / awaiting steer.**

## ▶ NEXT 3 (in order)
1. **W9-L3** Make the deterministic emitter scale BoM quantities + part sizes with throughput (the dominant cost-scale lever; core, all classes). THE fix for the 2× cost-blindness.
2. **W9-L1/L2 tail** Fix co2-mineralisation's 10 frozen `q(c)` reads (same idiom as e-fuel); extend `audit-sizing-scale.ts` to catch the inline-literal freeze pattern (L2); then Mechanism-B audit of `engineering-contract.ts` authoritative quantities (BESS rack_count etc.).
3. **W3.2** Instrument rounds-to-converge — engineering (convergence_loop reports `iterations`) + Blender visual loop (Tristan's "how many rounds?").

---

## WORKSTREAMS (status: ✅ done · 🔄 active · ⏳ queued · ❌ not started)

### W1 · Universal Blender CAD scene builder ✅ (mature; polish ongoing)
- ✅ 5 geometry families + generic-assembly fallback (~40 archetypes), INSPECT light-mode render.
- ✅ Pipe-rack routing, role-based flow derivation, real connection sizing (`connection_sizing.py`).
- ✅ Phase-D auto-upsize, D2 sub-distribution actuation, costed distribution BoM.
- ⏳ W1.x polish families to 10/10 each (robotics/marine/device still sensible-fallback). [orig loop]
- Files: `scripts/blender-universal/build_universal_scene.py` (+ `connection_sizing.py`).

### W2 · The 8 design-and-construction drawings ✅ (IN the PDF, lead-and-weave)
- ✅ All 8 generators built + self-verified: cable schedule, single-line diagram, P&ID, panel/load
  schedule, GA, process schedules (line/valve/instrument), HVAC layout, piping isometrics.
- ✅ Cross-referenced by identical tags (203-ST-DN200 same on P&ID + line list + iso).
- ✅ **Placement LEAD-AND-WEAVE** (Tristan 2026-06-11): system drawings open Part 2; schedules weave in.
- ✅ **W2.1a — driver** `generate_drawing_set.py` (ac3660fcd): state.json → drawings/ + drawing-manifest.json.
- ✅ **W2.1b — chain step** wired (serial-design-chain-v2 L6682; reuses CAD artifacts else headless Blender).
- ✅ **W2.1c — renderer** `buildSystemDrawingPages` + woven schedules.
- ✅ **W2.1d — verified** on e-fuel v21 (127-pp PDF, gate 11 PASS). 2× run re-verifies on a fresh build.
- Files: `scripts/blender-universal/draw_*.py` + `generate_drawing_set.py`.

### W4 · Part 2 manufacturing layer (Option A EVOLVE) ✅ — the drawings' table-form twin
- ✅ **M1 make-vs-buy** (`bom-make-vs-buy.ts`, 865aab420) — per-line bought/fabricated/custom; in the dossier.
- ✅ **M2 process route** (`bom-process-route.ts`, df78a76dd) — per-made-item route + steps; in the dossier.
- ✅ **M3 assembly sequence** (`bom-assembly-sequence.ts`, a52f744ee) — plant erection/build order page.
- 🔄 **M4 cost-of-goods build-up** — DOE/NETL prices now ground the BoM (W8.2 + build-cost-basis reconcile);
  full per-unit COGS split (materials+labour+process+overhead) is the remaining depth, not the price gap.
- Renderer computes M1/M2/M3 from `state` at render (`require('./lib/cost/bom-*')`) → automatic on fresh runs.

### W3 · Convergence + optimisation loops 🔄 (BUILT, not wired, round-count not reported)
- ✅ Physics↔CAD convergence loop (`convergence_loop.py`) — fixed point, contraction proof, 2-4 iters.
- ✅ Economic-conductor optimiser + layout-length 2-opt (`design_optimisation.py`).
- ✅ `economic_distribution_summary` — the saving as a reportable artifact.
- ❌ **W3.1 — wire the loops into the pipeline** (emit convergence-report.json + economic-optimisation.json per run; feed optimised sizes downstream).
- ❌ **W3.2 — instrument rounds-to-converge (Tristan's "how many rounds?")** — engineering loop already
  reports `iterations`; the BLENDER visual loop needs a deterministic quality score + a round counter
  so "render → critique → improve" has a measured convergence, not a vibe.
- Files: `scripts/blender-universal/{convergence_loop,design_optimisation}.py`.

### W4b · Part 2 — bill of materials (the BoM half; was a duplicate W4 number) ✅
- ✅ **W4.1 — distribution BoM into the dossier** (6920fc9c0) — `buildDistributionCablingPages` reads the
  routed `connection-schedule.json`; cabling/piping/ductwork (historically OMITTED) now a costed Part-3 page.
- ✅ **W4.2 — economic-conductor saving** surfaced (cable+pipe+terminations split + UK-2026 supply+install).
- ✅ **W4.3 — "How it is manufactured" section** (3f0100b91) — make-vs-buy + process route narrative.
- Files: `connection_sizing.py`, chain drawing-set step, `render-minimal-pdf.tsx` Part-2/3 builders.

### W5 · Universal CAD quality → 10/10 per archetype ⏳ (the original loop, partial)
- ✅ process-plant, rack-farm (battery/compute), panel-array, aero (aircraft/spacecraft), tower, fallback.
- ⏳ polish each family to a verified 10/10; perfect archetype-1 → next → … (Tristan's sequencing).
- Detail log: `BLENDER-UNIVERSAL-LOOP-TRACKER.md`.

### W8 · GROUND THE DOSSIER IN THE NEW PHYSICS + CAD (Tristan 2026-06-11) 🟢 (closed — 2× run re-verifies)
The new physics engine + universal CAD were DISCONNECTED from the dossier. Now wired:
- ✅ **W8.1 — new Blender renders into the dossier** (1faac282d de-cage + d77da19f9 pipework). The drawing-set
  step writes `drawing-manifest.json` and the chain wires `manifest.hero → state.cad_hero_image_path` (L6692);
  the renderer falls back to it. e_fuel has no template hero → the clean universal-CAD render IS the cover
  (strict win). Conservative by design: it FALLS BACK, never overrides a good template (2026-06-10 rejection).
- ✅ **W8.2 — BoM PRICE grounding** (4a4b717ee + a5f97993b). `bom-cost-grounding.ts` re-prices BoM lines from
  DOE/NETL Class-4 curves + db-only distributor cache (universal); wired into the chain (L6130) with an
  understatement guard. e-fuel went 16 lines grounded; `build-cost-basis` reconcile made it ONE engine.
- ✅ **W8.3 — BoM grounded in the CAD** = W4.1 (routed cable/pipe quantities → costed distribution page).

### W6 · Bill-of-materials DATA coverage / growing-DB ⏳ (the AIM's real long pole)
- The pretraining DB must self-generate per-class branded parts on the fly (DB-first → web/own-training
  on miss → verify → writeback). Foundational for ≥8 BoM on unseen archetypes. [the-aim]
- Largely a DATA problem, not code. Tracked here so it is never forgotten under the code work.

### W7 · Tracking discipline 🔄 (this file)
- ✅ Master tracker created 2026-06-11 (this file).
- 🔄 Keep it current: read at increment start, update after. Reconcile the stale TaskList.

---

## 🐞 KNOWN DEFECTS (tagged — must NOT slip again)
- ✅ **D1 — FIXED** (31eaed1cb universal auto-BFD `draw_bfd.py` + 4d1f0dcc8 wired into Part-1 + b183c6609
  own landscape page). WAS: a degraded box-list for every class except CO₂ (Tristan flagged
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
- `d64aa9f3a` build-cost-basis UNIVERSAL — the cost-system reconcile (one DOE/NETL engine, all classes)
- `d77da19f9` low local jumpers + central-corridor routing — pipework no longer "odd" (D2)
- `b23a27d70` + `a52f744ee` M3 assembly/erection sequence page + module
- `3f0100b91` + `df78a76dd` + `865aab420` M1 make-vs-buy + M2 process route — "How it is manufactured"
- `6920fc9c0` distribution & cabling BoM page (the routed runs the BoM always omitted) — W4.1
- `a5f97993b` + `4a4b717ee` bom-cost-grounding wired (DOE/NETL prices replace LLM guesses) — W8.2
- `1faac282d` de-cage the INSPECT render + legible pipework — W8.1
- `b183c6609` + `4d1f0dcc8` + `31eaed1cb` universal auto-BFD → Part-1 process flow, own page — D1
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
