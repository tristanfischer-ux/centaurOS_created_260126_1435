# Universal Auto-Harvest — the Stage-0 reference harvest as the automatic first step for ANY unseen class

> Status: SPEC (not built). CO₂ is the proving case — its harvest was run manually this session (2026-06-04). Drawer `forgeos_decisions_345b36030653e26b`; memory `forgeos_stage0_reference_harvest_runner.md`. This is THE P1 ("new classes on the fly").

## Problem (proved by CO₂)
A new archetype currently **skips** the Stage-0 reference harvest every original archetype went through, and runs on a single-pass hand-authored emitter → a single-source, shallow data foundation → thin bom/sources, and embedded errors (a fictional part, a 7× oversized boiler) that only the multi-source harvest catches. Tristan's directive: **"do previous training search first … that needs to happen for any new archetype."** Today the harvest is ad-hoc (run via sub-agents). It must be automatic.

## Design

**Hook** — a chain pre-step right after `classifyProduct(brief)` (`scripts/serial-design-chain-v2.tsx:2114`), before generation. Conceptually an INGEST job the chain triggers (chain-as-DB-consumer rule: live LLM/web calls happen in ingest, NOT chain-side; the chain then reads DB-only, preserving quota protection).

**Trigger — detect a thin/unseen class.** A class needs the harvest when its reference coverage is thin:
- no baked `class-reference-graphs/<class>.ts` AND a thin DB graph (`class_reference_graphs` nodes < ~15), AND/OR
- few class-tagged embedded corpus parts (`pretraining_extracted_parts WHERE component_class=<class> AND embedding NOT NULL` < ~40).
- (co2 pre-harvest: 9-node DB graph, 21 NULL-embedded parts → THIN. Mature classes: 19–23-node baked graphs. co2 post-harvest: 90 embedded parts — parts now covered; graph still thin → enrich.)

**Action — the harvest** (the runner below):
1. `buildStage0Prompt(domain, brief-description)` (`src/lib/stage-0-prompt.ts`) × N diverse LLM lineages (the union — "a baseline no single model gives").
2. web/datasheet legs — real plants + verified parts/suppliers/standards with provenance.
3. synthesise → union dossier (`~/Downloads/forge-demos/stage-0-reference/<class>-reference-dossier-v2.md`) + structured extract JSON.
4. **VERIFY** each proposed part exists (web/distributor) BEFORE writeback — gate-20 guard: an unverified own-training MPN poisons the DB. Type-only parts → `part_number = null`.
5. ingest class-tagged + EMBEDDED (text-embedding-3-small @1536d) → `pretraining_extracted_*`; enrich `class_reference_graphs` nodes/edges.
Then the chain proceeds; DB-first reads (Stage 17.6 RAG, Engine-C anchor, K10 graph, the corpus_price tier) now hit the fresh corpus.

**Precedent** — the engineering-lock-gate (gate 22, `lib/engineering-lock-gate.ts`, exit 22) already does DB-first → web-search-on-miss for HARD spec slots. The harvest GENERALISES that from HARD-slots-only to the full reference dataset (modules / parts / suppliers / standards / sizes).

## Build pieces (the work)
1. **Committed harvest runner** — `scripts/ingest/harvest-class.ts <class> <brief>` — replaces the ad-hoc sub-agent process: the multi-LLM Stage-0 calls + synthesis + verified ingest. Reuses `buildStage0Prompt` + the ingest logic in `scripts/ingest/_ingest-co2-harvest.mjs`. (The exploratory web leg can be a bounded WebSearch pass, or deferred to a v2 — the LLM union already triangulates a strong first cut.)
2. **Trigger check** — `classCoverageIsThin(class): boolean` (graph-node + embedded-part counts).
3. **Pre-step wiring** — in `serial-design-chain-v2.tsx` after `classifyProduct`: if thin → run/await the harvest (or flag + trigger the ingest ahead), env-guarded (e.g. `HARVEST_ON_MISS=1`, default off so existing runs are unaffected).

## Open questions (Tristan)
- **Synchronous** (chain waits for the harvest, ~minutes for a first-of-class) vs **asynchronous** (flag + ingest ahead-of-run; the chain uses whatever coverage exists)?
- **Web leg scope** — bounded in-runner WebSearch (provenance, catches the fictional/oversized errors), or LLM-union-only as the cheap first pass?
- **N lineages** — the proven set was ~8–10 across Gemini/GPT/Grok/Qwen/DeepSeek/Kimi/Mistral/GLM. Cost ~£0.04–15/class.

## Why this is the long pole
The wiring layers (classifier/envelope/emitter/class-plan/hazards) are NOT a new archetype's biggest risk — skipping the data harvest is. Hand-authored emitters embed fictional/oversized/mis-cited parts invisibly; only the multi-source harvest surfaces them, and only a class-tagged embedded corpus lets the chain price + source + size from real data. This closes the "universal, NOT per-class hand-coding" gap.
