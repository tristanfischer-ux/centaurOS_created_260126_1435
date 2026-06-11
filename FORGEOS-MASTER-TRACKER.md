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
**W2.1 — wire the 8 drawings into the dossier PDF render.** (Was blocked on a false "foreign-dirty"
premise; Tristan confirmed 2026-06-11 there are NO other terminals — the chain is mine to edit.)

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

### W2 · The 8 design-and-construction drawings 🔄 (BUILT, NOT in the PDF)
- ✅ All 8 generators built + self-verified: cable schedule, single-line diagram, P&ID, panel/load
  schedule, GA, process schedules (line/valve/instrument), HVAC layout, piping isometrics.
- ✅ Cross-referenced by identical tags (203-ST-DN200 same on P&ID + line list + iso).
- ❌ **W2.1 — wire all 8 into the dossier PDF render.** ← THE GAP. Currently output to /tmp as PNGs.
  - [ ] find the render integration point in `serial-design-chain-v2.tsx` / `render-minimal-pdf.tsx`.
  - [ ] generate the drawing set from the SAME state the dossier renders from.
  - [ ] add the drawings as PDF pages (a "Design & construction drawings" section).
  - [ ] verify on a real dossier (open the PDF, see all 8).
- Files: `scripts/blender-universal/draw_*.py`.

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

### W6 · Bill-of-materials DATA coverage / growing-DB ⏳ (the AIM's real long pole)
- The pretraining DB must self-generate per-class branded parts on the fly (DB-first → web/own-training
  on miss → verify → writeback). Foundational for ≥8 BoM on unseen archetypes. [the-aim]
- Largely a DATA problem, not code. Tracked here so it is never forgotten under the code work.

### W7 · Tracking discipline 🔄 (this file)
- ✅ Master tracker created 2026-06-11 (this file).
- 🔄 Keep it current: read at increment start, update after. Reconcile the stale TaskList.

---

## DONE LOG (this arc — newest first)
- `9be4c88cf` economic_distribution_summary (saving as a BoM artifact)
- `431d94531` convergence loop + economic-conductor & layout optimisers (45 checks)
- `5ffb81777` piping isometrics + route export — drawing set #8, SET COMPLETE
- `118ac1da1` HVAC layout (#7) · `b4f8e8515` process schedules (#6) · `c1c09779d` GA (#5)
- `07e703401` panel schedule (#4) · `340ffdebc` P&ID (#3) · `4cdc0ccca` single-line (#2)
- `8ef37b417` connection sizing engine · earlier: 5 geometry families + routing + Phase D/D2

## DECISIONS · CONSTRAINTS · CORRECTIONS
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
