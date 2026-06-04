# Plan — moat self-growth, novel-archetype UX, and first-principles chemical-process tooling

> Drivers (Tristan 2026-06-04): (1) "do embedding when you can"; (2) "on the app create the dialogue saying something is novel and will take more time to research + do first principles + tool use + search"; (3) "for co2 were there additional tools you should be using to ground the numbers? research organic/inorganic chemistry + reactor tools". Sequenced A → B → C.

---

## A. Embedding on write-back — make the moat actually compound (DO FIRST)
**Gap (audited 2026-06-04):** new BoM items ARE written back to `pretraining_extracted_parts` with MPN + provenance, but most are NOT embedded → invisible to the chain's embedding-cosine RAG. The moat grows in rows, not in retrievable coverage.
- `distributor:mouser/farnell/digikey` — 1,838 rows, **0 embedded**
- `emitter_completion:llm` — 383 rows, **0 embedded**
- curated seeds — 121 rows, **0 embedded**
- (only the original pretraining corpus 87% + my co2 harvest ingest 100% carry vectors)

**Fix:**
1. Add an embed step to every write-back path: `scripts/lib/background-enrichment.ts` (emitter-completion + reviewer-override) and the distributor-cascade write-backs — reuse the existing helper (`background-enrichment.ts` text-embedding-3-small @1536d, Float32LE). Embed `[part_name, manufacturer, part_number, raw_excerpt].filter(Boolean).join(' ')` (matches the corpus convention).
2. One-off **backfill** job: embed the ~2,342 existing NULL-embedded rows (idempotent, by embed_hash). Pattern = `scripts/ingest/_ingest-co2-harvest.mjs`'s embed loop.
**Verify:** write-back paths produce 1536-d vectors; backfill clears the NULL-embedded backlog; a RAG query for a back-filled part now retrieves it.
**Universal** — every class's BoM/sourcing compounds across runs. ~1 focused agent. CHAIN-AS-DB-CONSUMER: embedding calls go in the ingest/enrichment paths (already off the chain's critical path), not chain-side.

---

## B. App "novel archetype" dialogue — honest UX for first-of-a-kind
**Trigger:** the `classCoverageIsThin(class)` signal (from `docs/universal-auto-harvest-plan.md`): no baked class-reference graph + thin DB graph (<~15 nodes) and/or <~40 class-tagged embedded parts.
**UX:** when a user submits a class the engine detects as novel/thin, surface a dialogue + live status instead of pretending it's instant:
- Copy (Tristan voice — lead with the useful thing, no failure-framing): *"This is a new kind of system I haven't built a deep reference library for yet. I'm researching it properly — searching real comparable systems, working the engineering from first principles, and running the calculation tools — so the numbers are grounded. This takes longer than a system I've seen before."*
- Live stages: `Researching comparable systems…` → `Building the reference library…` → `Grounding the numbers (tools)…` → `Drafting`.
**Build:** (1) surface `classCoverageIsThin` from the chain to the app job-status; (2) a status/dialogue component + the copy; (3) map the harvest + tool stages to progress messages; (4) set the longer-ETA expectation up front.
**Process:** MOCKUP-FIRST (static HTML mockup → sign-off → port), per the Mockup-First Principle. Product/UI feature — needs Tristan's design sign-off.

---

## C. First-principles chemical-process tool family — ground the numbers (research + build)
**Finding:** the `.venv` already has the libraries (Cantera 3.2, thermo 0.6, chemicals 1.5, **thermosteam/BioSTEAM 0.53**, CoolProp 7.2, fluids 1.3, ht 1.2) but the orchestrator has NO dedicated unit-operation tools for a chemical process plant. Nearest existing: `dac:{regeneration-energy,sorbent-kinetics,contactor-geometry}` (solid-sorbent capture, not amine), `biosteam:fermentation-stoich`, `kla-oxygen:transfer`, `agitation:power`, `ph-titration:sizing`, `cantera:thermochemistry`. So co2's absorber height, stripper/reboiler duty, reactor volumes, gypsum/CaCO₃/K₂SO₄ tonnages, crystalliser + dryer duties are LLM-guessed.

**Highest-leverage move — wire thermosteam (BioSTEAM) as a process-flowsheet tool.** It is already installed and is a full process simulator (streams, mass + energy balance, reactions, distillation, flash, heat exchangers). One `process-flowsheet:simulate` tool that builds the co2 unit train in thermosteam would ground the WHOLE plant's mass/energy balance from first principles in one place — the single biggest grounding win, and reusable for any process class (capture, desalination, electrolysis, fermentation, water treatment).

**Plus the gap unit-op tools (universal across chemical-process classes), built on the libs above, each emitting `_worked.py` worked-calculations (showable maths):**
1. `reaction:stoichiometry-balance` — balanced-reaction product masses from feed (resolves the gypsum 3.91 vs 3.1 t/day discrepancy; grounds CaCO₃ + K₂SO₄ tonnages). Lib: `chemicals` (MW) + balance solver.
2. `reaction:feasibility-gibbs` — ΔG / equilibrium constant for a reaction at T (grounds whether the **novel** K₂SO₄/MEA loop is thermodynamically real — the part with no plant analogue). Lib: Cantera `equilibrate` / `thermo`.
3. `absorption:column-htu-ntu` — gas-liquid absorber/stripper packed height + diameter from CO₂ load, solvent rate, packing HTU (grounds the 100 mm / 1.6–8.2 m absorber + the stripper). Lib: `thermo` VLE + HTU/NTU correlations.
4. `reactor:cstr-pfr-sizing` — reactor volume + residence time from conversion + kinetics (grounds the carbonation + K₂SO₄ reactors). Lib: `scipy` + rate law.
5. `crystalliser:evaporator-sizing` — crystalliser/evaporator duty + size from solubility vs T (grounds K₂SO₄ recovery). Lib: `chemicals`/`thermo` solubility + energy balance.
6. `dryer:thermal-sizing` — drying air flow + heat duty from evaporative load (grounds the CaCO₃ + K₂SO₄ dryers). Lib: `psychrolib` (already wired) + heat/mass balance.

**Pattern:** each tool = a Python impl in `scripts/lib/orchestrator/tools/python/` + a TS wrapper (registerTool) + `applicable_to` the chemical-process classes + `worked[]` via `_worked.py` + class-plan wiring (co2 + the process-plant family) + a parts-spec/sizing gate where relevant. Precedent: the DAC tools + `biosteam:fermentation-stoich`.

**Priority within C:** (i) `process-flowsheet:simulate` (thermosteam) — biggest single grounding win; (ii) `reaction:stoichiometry-balance` + `reaction:feasibility-gibbs` — ground the core mass balance + the novel-chemistry validity; (iii) the column/reactor/crystalliser/dryer sizers. Research step first: validate each lib's capability on the co2 species (CO₂, MEA, CaSO₄·2H₂O, CaCO₃, K₂SO₄, KOH) before building — confirm thermo/Cantera have the species data; where they don't, that's a first-principles + literature-correlation tool, not a library call.

**Universal:** this is the "process-plant" tool family — it serves CO₂ capture, DAC, desalination, electrolysis, fermentation, water treatment, any reactor/separation/crystallisation class. Not co2-only.

---

## Sequencing
1. **now** — v9 lands → confirm the bom lift from the pin-override.
2. **A (embedding)** — when v9 frees the write-back code; ~1 agent + a backfill. Universal, immediate.
3. **B (novel-archetype dialogue)** — mockup-first → Tristan sign-off → build.
4. **C (chemical-process tools)** — research-validate the libs on the co2 species → build thermosteam flowsheet + the 6 gap tools → wire into co2 + the process-plant class-plan → re-run co2 (the numbers ground; the novel K₂SO₄ loop gets a feasibility verdict, not a guess). Largest workstream; the AIM-aligned "first principles + tool use" answer.
