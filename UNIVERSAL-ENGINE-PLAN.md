# The Universal Engine — plan for "any industrial product class, zero hand-tuning"

_Author: Claude (autonomous), 2026-05-30. Grounded in code/DB facts verified this session, not memory._
_View styled: `~/.claude/scripts/show-md "/Users/tristanfischer/Developer/CentaurOS created 260126 1435/UNIVERSAL-ENGINE-PLAN.md"`_

## North star
**Any brief, for any industrial product, → a ≥8 council dossier, with NO per-class bespoke code.**
Today the engine makes good dossiers for ~21–35 classes, but each new class costs ~4 hand-written files. "Universal ability to make all industrial products and classes" means: a new class = **a brief, and nothing else**. The engine grounds, plans, sizes, prices, emits, and renders it from data — not from code someone wrote for that class.

Definition of done (per class, zero new code):
1. The brief parses → typed metrics[] (already universal, P1-1).
2. The class **reference** ("what does this product contain, to what standards, in what proportions") is fetched from a **growing DB**, not a baked TS file.
3. The **tool graph** is **composed** from the brief + each tool's declared I/O — not a hand-written class-plan.
4. The **contract quantities** are derived from brief metrics + physics tools generically.
5. The **BoM** is emitted by ONE generic emitter walking the DB reference + pricing every line **DB-first**.
6. All 30 gates pass; council ≥8.

## The universality tax (verified 2026-05-30)
| Per-class hand-written artifact | Count | What it is |
|---|---|---|
| `scripts/lib/orchestrator/class-plans/*.ts` | **35** | the tool graph (which tools, in what order, fed how) |
| `scripts/lib/orchestrator/emitters/*.ts` | **36** | the BoM word tree |
| `src/lib/pdf-engine-v2/class-reference-graphs/*.ts` | **21** | frozen 2026-05-18 "what a BESS contains" snapshot |
| `scripts/lib/engineering-contract.ts` archetype builders | **46** | the quantity builder |
| `src/lib/pdf-engine-v2/performance-card.ts` schemas | 6 | spec-sheet (now AUTO-synthesised for unmapped classes ✅) |

≈ **140 hand-tuned files**. Each new class ≈ 4 files + tuning iterations. That linear cost is the thing standing between "21 classes" and "all industrial products."

## What is ALREADY universal (the mechanism — keep, don't rebuild)
- The **30 deterministic gates** (exit codes 10–30) — class-agnostic quality floor.
- **Render / council / cost-stack / compliance** — universal.
- **This session's universalisations** (2026-05-30):
  - Gate-17 Brief Compliance now emits a row for EVERY brief metric (unit-stripped base-key resolver), no per-key METRIC_MAP edits — `cda406c18`.
  - Performance spec-sheet auto-synthesises from brief metrics[] for any unmapped class — `c8686f317`.
  - Cost stack shows £/output-unit at every stage; B-7 (aggregate) + B-8 (per-macro, commodity-grounded) cost guards — `5e52efed3`, `d5a57d641`, `bc5bb5839`.
- The **growing-DB pattern**, proven for part PRICE (`distributor_cascade_cache`) + part EXISTENCE (`pretraining_extracted_parts`, 36,805 rows): **DB-first → web-on-miss → write-back → grow**.

## The five levers (ranked by leverage toward zero-hand-tuning)

### Lever 1 — DB-grounded class reference (retire 21 frozen graphs) — KEYSTONE
- **Today:** `class-reference-graphs/*.ts` are baked TS snapshots from 2026-05-18; the chain reads them, never the live DB. "Class grounding is FROZEN baked TS" (tracker).
- **Target:** `classReference(className)` composes the reference at runtime from `forge-truth.db` (`pretraining_extracted_parts` 36,805 / `_specs` 15,027 / `_standards` 4,094), and on a miss for a NEW class, **web-searches → writes back → grows**. The reference is the SOURCE every other layer reads.
- **Why #1:** it's "the next major architectural move" (tracker + CLAUDE.md). Every other lever consumes it. DB-grounding it makes a new class **self-build** its reference instead of waiting for a human to hand-write a graph.
- **Effort:** large. Migration (seed table from the 21 frozen graphs) → read path (DB-first, baked-TS fallback) → web-on-miss writer → regression invariant (DB reference ⊇ baked reference for the 21 known classes).

### Lever 2 — Schema-driven auto-planner (retire 35 class-plans)
- **Today:** `planner.ts :: selectPlan(envelope)` picks a hand-registered plan by envelope match. It SELECTS; it does not COMPOSE. (TaskList "AP".)
- **Target:** `composeToolGraph(brief, toolRegistry)` — every tool declares `{ consumes: [...quantities], produces: [...quantities] }`; the planner topologically composes the minimal graph that produces the brief's required quantities. New class = no class-plan.
- **Why #2:** the class-plan is the largest per-class artifact; auto-composition is the single biggest reduction in the tax.
- **Effort:** large. Needs a tool-I/O manifest (most tools already have typed input_from_contract / contract_update — harvest it) + a topological composer + overlap/cycle validation (planner.ts already has `validatePlan` / `detectPlanOverlaps` scaffolding).

### Lever 3 — Universal emitter (retire 36 emitters)
- **Today:** `emitters/*.ts` hand-write the BoM tree per class.
- **Target:** one generic emitter walks the DB class reference (Lever 1) + contract quantities, emitting MPN-bearing words DB-first. This session's `completeEmitterGaps` + gate-23 (every sub_module has ≥1 real MPN) are the seed — generalise from "fill gaps" to "emit the whole tree."
- **Why #3:** depends on Lever 1. Eliminates the second-largest per-class artifact.
- **Effort:** large, gated on Lever 1.

### Lever 4 — Universal engineering-contract (thin the 46 archetypes)
- **Today:** 46 hand-written archetype builders compute quantities.
- **Target:** derive quantities generically from brief metrics[] + physics tools (which already compute most). Keep only genuinely class-specific physics as small plug-ins.
- **Why #4:** partially done (lock-gate HARD slots are universal). The long tail is real per-class physics — lower leverage, do last.

### Lever 5 — Materials growing-DB (Tristan-decided 2026-05-30) — IN PROGRESS THIS SESSION
- **Today:** static `material-prices.ts` (16 commodities, dated) used ONLY by the B-8 guard. The engine GUARDS against it but does not SOURCE from it.
- **Target:** `forge-truth.db` `material_prices` table; the engine **prices** material-dominated macros FROM it (steel tower £/kg = steel raw × mfg multiplier), DB-first with free web-refresh (Trading Economics free tier / public LME spot for the majors) and the dated table as the deterministic fallback.
- **Why now:** Tristan decided "full growing-DB + price from it." Self-contained, high-value (grounds cost universally), and a **clean working template** for the Lever-1 DB-grounding pattern (Lever 1 writ small).
- **Effort:** medium. Migration + seed + DB-first read in `engineering-contract`/`audit-pdf-bom` + refresh job + invariant. **Executing now.**

## Sequencing
1. **Lever 5 (materials DB)** — now. Decided, self-contained, a working template for the DB-grounding pattern.
2. **Lever 1 (DB-grounded class reference)** — the keystone; unblocks 3.
3. **Lever 3 (universal emitter)** — consumes Lever 1.
4. **Lever 2 (auto-planner)** — parallelisable with 1/3; biggest per-class reduction.
5. **Lever 4 (universal contract)** — long tail, last.

Cross-cutting: keep every change behind the 30-gate floor + a regression invariant (per the "iter-N catches iter-(N+1)" rule). Never let a universalisation drop a class below its current council score — validate on BESS + VF + wind each step (the three I have warm states for).

## Autonomous execution log (this session)
_Updated as I go; commits are the source of truth._
- [✅ DONE] **Lever 5 — materials growing-DB.** `material_prices` table seeded in forge-truth.db (15 commodities); `getMaterialPrice()` DB-first read (proven via DB-only sentinel); B-8 gate grounds the commodity band in the DB; `seed-material-prices.ts` + `refresh-material-prices.ts` ingest jobs; `deriveMacroMaterialRateGbpPerKg()` "price-from-it" primitive (auto-derives the wind blade at £18.3/kg = the value hand-fixed earlier — the universal path reproduces it for free). Invariant `UNIVERSAL.material_db_first_never_drops_curated`. The primitive is ready to be consumed by the universal emitter (Lever 3). Live feed remains a pluggable hook (free-source default, paid upgrade later).
- [NEXT / keystone] **Lever 1 — DB-grounded class reference.** Same pattern as Lever 5, applied to the 21 frozen `class-reference-graphs/*.ts`: seed a `class_reference` table in forge-truth.db from the baked graphs → `getClassReference()` DB-first with baked-TS fallback → web-on-miss for new classes → invariant (DB reference ⊇ baked for the 21 known classes). Larger; best as its own focused session — the materials work is the validated template.
- [queued] Lever 3 (universal emitter, consumes Lever 1 + the price-from-it primitive), Lever 2 (auto-planner), Lever 4 (universal contract).
- [ongoing] Re-validate BESS/VF/wind unaffected after each lever (warm states available).

## Open forks for Tristan (non-blocking; sensible defaults chosen)
- **Materials live feed:** default = free sources (Trading Economics free tier / public LME spot) for the majors + dated table fallback. Upgrade to a paid feed (LME/Fastmarkets) later if accuracy demands — needs a key + budget.
- **B4 payload breach (carried from TRACKER):** ~30 t system vs ~26.6 t ISO-668 payload — default = bespoke heavy-duty enclosure + split-transport note, keep 2.5 MWh.
- **Auto-planner risk:** composed graphs may be inferior to hand-tuned ones for the 21 known classes initially — mitigation: keep hand plans as overrides; only auto-compose for UNREGISTERED classes first, then migrate.
