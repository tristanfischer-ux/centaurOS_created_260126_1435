# WS-B Design Memo — Decouple pdf-engine-v2 BoM line count from the hardcoded Phase 0 skeleton

Date: 2026-05-13
Author: Investigation pass (Opus 1M)
Scope: ForgeOS / pdf-engine-v2 radical pipeline
Status: Proposal — awaiting Tristan's sign-off before any code changes

---

## 0. Executive summary

The BoM line count is **NOT** capped by `decomposition-bess.json` or by the `phase-0-slice/bess-hardcoded-tree.ts` hardcoded tree. Those files are confined to the `RADICAL_PHASE_0_SLICE=true` feature flag and only run when the flag is on (single-product debug path; see `src/lib/pdf-engine-v2/index.ts:286-308`). The Phase 0 hardcoded tree has 25 leaves — well below the 101-102 number observed.

The real ceiling is the **`WORDS` table inside `radical/character-hierarchy.ts`**. Every BESS run resolves to exactly the unique set of `character_id`s that any BESS-allowed sentence's `characters[]` array contains. Counted on disk:

- 8 sentences whose `allowed_classes` include `'bess'`
- ~31 words covering those sentences
- **106 unique character_ids visible to the BESS class** (file: `src/lib/pdf-engine-v2/radical/character-hierarchy.ts:416-636`; counted by parsing `WORDS[]` + `SENTENCES[]`)

Inside `buildTreeFromLeaves` (`src/lib/pdf-engine-v2/radical/structural-builder.ts:1129-1148`), leaves are deduplicated by archetype inside each word — so the final BoM row count after dedup is bounded by `min(LLM leaf emissions ∩ in-library characters, ~106)`. With dropouts for `<UNKNOWN>` leaves and class-allowed filtering this lands at **~101-102** every run.

The fix is to invert two arrows:

1. The **Tier 4 per-module Stage 2 LLM** should emit `SubModuleSpec.words[].content_character.character_id` values as the **sole** source of truth for what BoM rows exist.
2. The `WORDS` / `SENTENCES` tables become a **consultation index** keyed by `character_id` (look up MPN hints / Grade D price / allowed_classes), not a **gating filter** that decides which characters can appear.

The two hardcoded skeletons (`bess-hardcoded-tree.ts` and `radical/week-*/decomposition-*.json`) are **already orphaned** from the production tree-build — they are only used by the Phase 0 vertical-slice debug runner and the demo cost-rollup test. Deletion is safe.

---

## 1. Phase 0 entry points

Directory: `src/lib/pdf-engine-v2/radical/phase-0-slice/` — 2 files.

| File | LoC | Role |
|---|---|---|
| `bess-hardcoded-tree.ts` | 155 | Builds a hardcoded BESS RadicalTree from a static `BESS_MODULE_CHILDREN` record (8 modules → 25 leaves). |
| `pipeline.ts` | 284 | Entry point `runPhaseZeroSlice(llmEmittedTree?)`. Loads either the hardcoded tree (default) or the optional LLM-emitted tree (when `RADICAL_PHASE_1_TREE_OUTPUT=true` is also set), then runs grammar + cost rollup. |

Entry function: `runPhaseZeroSlice` (`pipeline.ts:124-283`). Invoked only when `isPhaseZeroSliceEnabled()` returns true, gated by `RADICAL_PHASE_0_SLICE=true`. See `src/lib/pdf-engine-v2/index.ts:286-308`.

The Phase 0 slice is feature-flagged debug machinery — it is **not** on the production pipeline path for any normal pipeline run.

---

## 2. Hardcoded JSON / skeleton files

| File | Top-level keys | Leaf count |
|---|---|---|
| `radical/week-2/decomposition-bess.json` | `bom_lines[]` | 25 |
| `radical/week-3/decomposition-vfarm.json` | `bom_lines[]` (variable) | ~22 |
| `radical/week-3/decomposition-heat-pump.json` | `bom_lines[]` | ~18 |
| `radical/week-4/decomposition-bioreactor.json` | `bom_lines[]` | ~19 |
| `radical/week-4/decomposition-drone.json` | `bom_lines[]` | ~20 |
| `radical/week-4/decomposition-edge-ai.json` | `bom_lines[]` | ~17 |
| `radical/week-4/decomposition-ev-charger.json` | `bom_lines[]` | ~19 |
| `radical/week-5/decomposition-auv-coastal.json` | `bom_lines[]` | ~19 |
| `radical/week-5/decomposition-cgm-wearable.json` | `bom_lines[]` | ~18 |
| `radical/week-5/decomposition-haps-stratospheric.json` | `bom_lines[]` | ~19 |

Plus the in-code skeleton:

| File | LoC | Leaf count |
|---|---|---|
| `radical/phase-0-slice/bess-hardcoded-tree.ts` | 155 | 25 |

These are **manual decomposition reference artefacts** from the Week 2–5 commissioning passes. Real production runs do NOT load them. The only consumers are:

- `radical/demo/resolution.ts:20` — `import bessDecomp from '../week-2/decomposition-bess.json'` (demo grammar / cost-rollup harness).
- `radical/demo/cost-rollup.ts:14, 57, 71` — references the JSON for module mapping comments.
- `radical/phase-0-slice/bess-hardcoded-tree.ts` — re-states the same data in TypeScript so the slice can run without the JSON file.

None of the `decomposition-*.json` files affect a normal `runDecomposeRadicalPerModule` run.

---

## 3. Phase 0 → Phase 1 flow and where leaves actually come from

There is **no** flow from Phase 0 (hardcoded skeleton) into Phase 1 (LLM leaf identification). They are alternative paths into the same downstream pipeline, gated by separate flags:

- `RADICAL_PHASE_0_SLICE=true` → invokes `runPhaseZeroSlice()` with hardcoded tree.
- `RADICAL_PHASE_1_TREE_OUTPUT=true` → invokes `runDecomposeRadical()` (single-shot LLM tree emission) at `src/lib/pdf-engine-v2/index.ts:1233-1281`.
- `RADICAL_PHASE_3_PER_MODULE=true` → invokes `runDecomposeRadicalPerModule()` (per-module Stage 2 LLM) at `index.ts:1086-1219`. This **takes precedence** over Phase 1 if both flags are set.

The production path for the radical pipeline today is **Phase 3 (per-module)**, not Phase 0 or Phase 1. The state object's `state.radicalTree` is populated by:

- `index.ts:1196` — `state.radicalTree = perModuleResult.data.radicalTree.tree`

That tree is built by `buildTreeFromLeaves` in `radical/structural-builder.ts:953-1235`.

**Data flow for the production radical run (Phase 3 enabled):**

1. Stage 1.5 (`stages/1.7-module-decomposition.ts`) — LLM emits `ModuleDecomposition` containing `ModuleSpec[]`, each with `sub_modules: SubModuleSpec[]` and each sub-module with `words: WordSpec[]`. Each `WordSpec` has exactly one `content_character: { character_id: string, name_human: string }` and zero-or-more modifier characters. (See type definition in `src/lib/pdf-engine-v2/types/module-decomposition.ts:380-397`.)
2. Stage 2 per-module (`runOneModuleDecomposition` in `stages/2-decompose.ts:1292-1503`) — for each `ModuleSpec`, calls the LLM with the candidate character library (`buildPerModuleCharacterLibrary`, `stages/2-decompose.ts:1118-1148`) and returns `LeafRecord[]`.
3. The per-module results are **filtered** to keep only leaves whose `character_id` is in the candidate library (`stages/2-decompose.ts:1398-1420`).
4. Topology multipliers from Stage 1.5 `content_character` quantities are propagated onto leaves (`stages/2-decompose.ts:1422-1486`).
5. All sub-trees are unioned, deduped by `(character_id, archetype_id)` (`stages/2-decompose.ts:1576-1601`).
6. `buildTreeFromLeaves` consumes the aggregated leaves, looks each one up in `buildCharacterToWords()`, places each into the canonical sentence/word, then **dedupes again by archetype within each word** (`structural-builder.ts:1129-1148`).

The leaves are CONSUMED by Phase 2 resolution (`stages/4b-radical-resolution.ts:1527-1679`) which walks the tree and produces `ResolvedRadicalTree`.

---

## 4. The 102-leaf mystery — root cause

**The number 102 is determined here:**

| Layer | Mechanism | File:Line |
|---|---|---|
| Hard ceiling (BESS-allowed) | Unique `character_id`s referenced by any `WORDS[]` entry whose `sentence_id` points to a `SENTENCES[]` entry with `allowed_classes` including `'bess'` | `src/lib/pdf-engine-v2/radical/character-hierarchy.ts:416-636` (WORDS) + `139-410` (SENTENCES) |
| Hard ceiling enforced at | `buildPerModuleCharacterLibrary` builds the candidate set; out-of-scope leaves dropped | `src/lib/pdf-engine-v2/stages/2-decompose.ts:1118-1148`, drop at `:1398-1420` |
| Hard ceiling enforced at (2) | `buildTreeFromLeaves` filters words to class-allowed sentences via `isWordAllowed` | `src/lib/pdf-engine-v2/radical/structural-builder.ts:983-988, 1056-1063` |
| Dedup inside word | `leafByArchetype` Map keyed on `archetypeId` (which equals `character_id` post-`resolveArchetypeId`) | `src/lib/pdf-engine-v2/radical/structural-builder.ts:1132-1148` |

**Counted from the file:** 106 unique character_ids appear in BESS-allowed sentences. The pipeline emits ~101-102 because:

- 1-2 characters in the candidate library are not in fact emitted by the LLM on any given run.
- A few characters are co-located in multiple words but **only appear in the tree once** because of the archetype dedup at `structural-builder.ts:1132-1148`.
- `<UNKNOWN>` leaves are surfaced separately and dropped from the tree (`structural-builder.ts:1014-1030`).

So: **the cap is the BESS-allowed character_id universe inside `character-hierarchy.ts`** — _not_ the hardcoded JSON, _not_ the Phase 0 skeleton, _not_ a fixed-length mapping in `bess-hardcoded-tree.ts`.

The hardcoded Phase 0 skeleton has only 25 leaves and is **never** on the production code path. The 102 number is purely a function of the character library shape and the dedup-by-archetype rule.

---

## 5. Downstream consumers of `state.resolvedRadicalTree` and `state.radicalTree`

Writers:
- `src/lib/pdf-engine-v2/index.ts:1196` and `:1245` — `state.radicalTree`
- `src/lib/pdf-engine-v2/index.ts:1296` — `state.resolvedRadicalTree`

Readers (from `grep` over `src/lib/pdf-engine-v2`):

| File | Role |
|---|---|
| `stages/4b-radical-resolution.ts:1289-1311` | Phase 2 — consumes `state.radicalTree`, writes `resolvedRadicalTree`. Walks leaves via `collectLeaves` (`:1483-1507`). |
| `stages/4c-radical-cost-rollup.ts` (via `index.ts:1318-1344`) | Phase 3 cost rollup — depth-first walk of `resolvedRadicalTree` applying per-level markup. |
| `stages/4d-radical-grammar.ts` (via `index.ts:1353-1384`) | Phase 4 grammar — runs DRC rules over `resolvedRadicalTree` and optional `radicalCostSummary`. |
| `stages/7b-pdf-v3-radical-document.tsx:103-132, 260-298, 498, 1317, 2090-2400, 2890-2920` | Phase 5 PDF render — reads tree for §6 BoM table, §4 sub-module cards, §7 sourcing strategy, §8 distributor breakdown, leaves used for risk + lead-time histograms. |
| `radical/sentence-generator.ts:566-682` (`buildNaturalLanguageLayer`) | Reads `ModuleDecomposition.modules[]` (not `state.radicalTree`) — emits the §4.5 NL layer from `SubModuleSpec.words[].content_character`. |
| `radical/structural-builder.ts:953-1235` | Builds `state.radicalTree` from `LeafRecord[]`. |

Tree-driven analytics inside the renderer specifically: `7b-pdf-v3-radical-document.tsx:1748-2400` reads `chosen.sub_modules[].words[].content_character` for the §4 four-quadrant glyph cards. That path **already** drives off `content_character.character_id` directly — it does NOT use `state.radicalTree`.

So the renderer already has two parallel sources of "what character_ids are present in this product":

- `state.radicalTree` — driven by `WORDS`/`SENTENCES` hierarchy filtering, capped at ~106 chars.
- `state.moduleDecomposition.modules[].sub_modules[].words[].content_character.character_id` — driven directly by Tier 4 LLM emission, **not capped by the hierarchy at all**.

The §6 BoM (the table Tristan cares about) reads the first; the §4 sub-module glyph cards already read the second.

---

## 6. Inversion proposal — Tier 4 emissions as the source of truth

### 6.1 Target state

The pipeline should treat the `WORDS`/`SENTENCES` hierarchy as a **consultation index** keyed by `character_id`:

- "Given character_id `X`, which word(s) and sentence(s) is it typically a member of?" → for **grouping** the BoM, not gating it.
- "Given character_id `X`, what known MPN hints exist?" → already this is the model in `MPN_HINTS_BY_CHARACTER` (`4b-radical-resolution.ts:604`).
- "Given character_id `X`, what Grade-D price is known?" → already `GRADE_D_BY_CHARACTER` (`4b-radical-resolution.ts:738`).

And the **tree shape** comes from:

- Stage 1.5 `ModuleSpec[]` → defines sentence-level structure.
- Stage 1.5 `SubModuleSpec[]` → defines word-level structure within each module.
- Stage 1.5 `WordSpec[].content_character.character_id` → **defines each BoM row.**
- Stage 2 per-module LLM → can OPTIONALLY enrich `WordSpec` with non-baseline characters (modifiers / variants), but the **content_character set from Stage 1.5 is the floor and the spine.**

Per Tristan's §4.5 spec: 60 sub-modules × ~5 character_ids each = ~300 BoM rows. This is achievable as soon as Stage 1.5 stops aggressively dedupling content_characters across sub-modules.

### 6.2 Concrete dependency inversion

**Before** (today):

```
LLM Stage 1.5 → ModuleSpec[].sub_modules[].words[].content_character
                  ↓ (used for §4.5 card rendering only)
LLM Stage 2  → flat LeafRecord[]
                  ↓
buildPerModuleCharacterLibrary  ← character-hierarchy.ts WORDS/SENTENCES (filter)
                  ↓
buildTreeFromLeaves             ← character-hierarchy.ts WORDS/SENTENCES (group + filter again)
                  ↓
state.radicalTree (~102 leaves max for BESS)
                  ↓
Phase 2 resolution + Phase 3 cost + Phase 4 grammar + Phase 5 render
```

**After** (proposed):

```
LLM Stage 1.5 → ModuleSpec[].sub_modules[].words[].content_character   ← SOURCE OF TRUTH
                  ↓
buildLeavesFromContentCharacters()  ← new function: 1 character_id = 1 leaf record
                  ↓
Stage 2 (optional enrichment) — adds modifier-driven variants/quantities only
                  ↓
buildTreeFromContentCharacters()    ← new function: tree shape DERIVED from sub_modules tree
                                       (sentence_id = module, word_id = sub_module, leaf = word)
                  ↓
state.radicalTree (1 leaf per WordSpec; ~60 sub_modules × ~5 words ≈ 300 leaves for BESS)
                  ↓
Phase 2 resolution looks up MPN/Grade-D by character_id (consultation only)
Phase 3 cost rollup unchanged (still walks tree)
Phase 4 grammar unchanged
Phase 5 render unchanged
```

The key API change:

- New `LeafRecord` factory `leafRecordsFromModuleDecomposition(moduleDecomposition)` that walks `modules[].sub_modules[].words[]` and emits one `LeafRecord` per `WordSpec`, taking:
  - `character_id` from `word.content_character.character_id`
  - `multiplicity` from `word.modifier_characters.find(m => m.kind === 'quantity')`
  - `sub_module_id` from the parent `SubModuleSpec.id`
  - `word_id` from `WordSpec.id`
- `buildTreeFromLeaves` is replaced (or augmented) by `buildTreeFromModuleDecomposition` that builds the tree directly from the `ModuleSpec` / `SubModuleSpec` / `WordSpec` hierarchy. No hierarchy lookup is needed because the LLM has already told us the tree shape.

### 6.3 What happens to the per-module Stage 2 LLM call?

Two options:

- **(a) Eliminate.** If Stage 1.5 emits `WordSpec.content_character.character_id` reliably (it already does — `module-decomposition.ts:380-397` makes it mandatory), Stage 2 is redundant. The per-module call would only be needed to **enrich** with MPN hints or vendor manufacturer hints — which `state.radicalTree` doesn't need (Phase 2 derives those).
- **(b) Re-scope.** Keep Stage 2 but redefine its job as "produce ARCHETYPE_ID and MPN_HINT for each pre-existing content_character", not "emit a new leaf set". This keeps the LLM-in-the-loop value (vendor / supplier intel) without it gating tree shape.

Recommendation: **(b)** for the first migration phase, **(a)** as a follow-up once Stage 1.5 emission quality is proven.

### 6.4 What happens to `character-hierarchy.ts`?

It is **reduced from a gating table to a documentation table**:

- `SENTENCES`, `WORDS`, `ALL_PRODUCT_CLASSES`, `HIERARCHY_STATS` — keep as a reference for what the engine *expects* to see.
- `allowed_classes[]` filter — **remove**. Tier 4 has already chosen which characters belong to a product.
- `isWordAllowed` / `buildCharacterToWords` / `buildWordToSentence` — keep, but only consulted for analytic / display fallback when a leaf's `sub_module_id` is missing.

### 6.5 What happens to the JSON `decomposition-*.json` files and `bess-hardcoded-tree.ts`?

**Delete.** They are:

- Not on the production code path (Phase 0 slice is debug-only, feature-flagged off).
- Out of sync with the actual character library (the JSON files reference 25 leaves; the library has 106).
- Imported only by the demo harness (`radical/demo/resolution.ts:20`, `radical/demo/cost-rollup.ts:14`) and the Phase 0 slice.

Tristan's preference is **delete unless it breaks the system**. It does not break the system: Phase 0 slice + demo are not invoked by any production pipeline run. Confirmed by `grep` over `index.ts` — `runPhaseZeroSlice` only fires under `RADICAL_PHASE_0_SLICE=true`.

If a kept-reference is wanted, move the JSON files into a `_archive/` folder so they're searchable but not loadable.

---

## 7. Breakage risks of deleting Phase 0 hardcoded paths

| Phase | Still works without Phase 0? | Risk | What changes |
|---|---|---|---|
| Phase 1 (LLM leaf id, `runDecomposeRadical`) | YES | none | does not consult Phase 0 |
| Phase 2 (Resolution, `runRadicalResolution`) | YES | none | walks `state.radicalTree`; does not consult Phase 0 |
| Phase 3 (Cost rollup, `runRadicalCostRollup`) | YES | none | walks `state.resolvedRadicalTree`; does not consult Phase 0 |
| Phase 4 (Grammar, `runRadicalGrammar`) | YES | none | runs on `state.resolvedRadicalTree`; does not consult Phase 0 |
| Phase 5 (Render, `7b-pdf-v3-radical-document.tsx`) | YES | none | reads `state.resolvedRadicalTree` |
| Phase 0 slice (`runPhaseZeroSlice`) | NO | breaks the slice | The slice itself is the only consumer — it disappears with the deletion. Cost: lose the BESS-only debug harness. Phase 1+0 integration block at `index.ts:1260-1273` becomes a no-op. |
| `radical/demo/*` | NO (cost-rollup test only) | breaks demo tests | The demo harness was a Week 2 commissioning artefact; the production tests under `__tests__/` do not depend on it. |

Net assessment: **safe to delete**. The only loss is a debug harness that has been superseded by `__tests__/first-light-test.spec.ts` and the production per-module flow.

What needs to change before deletion:

1. Remove the `RADICAL_PHASE_0_SLICE` flag block in `index.ts:286-308` (or guard it behind a removed-flag warning).
2. Remove the Phase 1+0 integration block at `index.ts:1257-1274`.
3. Remove imports in `index.ts:45` (`isPhaseZeroSliceEnabled`, `runPhaseZeroSlice`).
4. Delete the four files: `radical/phase-0-slice/pipeline.ts`, `radical/phase-0-slice/bess-hardcoded-tree.ts`, `radical/demo/resolution.ts`, `radical/demo/cost-rollup.ts`. Move `radical/week-2..5/decomposition-*.json` to `_archive/` (or delete).

---

## 8. Migration steps (incremental, testable)

Each phase is independently shippable and reversible. The pipeline keeps working at every step.

**Phase A — Reroute the tree builder. (No deletions yet.)**

1. Add `leafRecordsFromModuleDecomposition(moduleDecomposition: ModuleDecomposition): LeafRecord[]` to `structural-builder.ts`. Walks `modules[].sub_modules[].words[]`, emits one `LeafRecord` per `WordSpec` with `character_id = word.content_character.character_id`, `multiplicity` parsed from quantity modifier, `sub_module_id` and `word_id` populated.
2. Add a new `buildTreeFromModuleDecomposition(moduleDecomposition, productSlug, productClass): BuildResult` that builds the tree DIRECTLY from `ModuleSpec[]` / `SubModuleSpec[]` / `WordSpec[]` — `sentence_id` ← `module.module`, `word_id` ← `sub_module.id`, leaf ← word. No hierarchy lookup.
3. Behind a new flag `RADICAL_TIER4_TREE=true`, call `buildTreeFromModuleDecomposition` instead of the Stage-2-aggregation + `buildTreeFromLeaves` path in `runDecomposeRadicalPerModule` (`stages/2-decompose.ts:1609-1635`).
4. Run end-to-end on BESS with the flag on. Verify: BoM row count > 200 (should approach 300 if Stage 1.5 emits all ~60 sub_modules × ~5 words).

**Phase B — Migrate Stage 2 to enrichment-only.**

5. Refactor `runOneModuleDecomposition` (`stages/2-decompose.ts:1292-1503`) so its output is **{archetype_id, mpn_hint, manufacturer_hint, estimated_unit_price_gbp} keyed by character_id**, not a new leaf list. Skip filtering / dedup / topology multiplier propagation — those moved to Phase A.
6. Update the LLM prompt so it ENRICHES the pre-existing content_character list rather than rediscovers leaves. Lower max_tokens (no longer emitting the full leaf list).
7. Verify telemetry: per-module LLM call cost drops by ~50%.

**Phase C — Drop the gating.**

8. Remove `buildPerModuleCharacterLibrary` (`stages/2-decompose.ts:1118-1148`). Stage 2 no longer needs to know the character library — it's enriching what Stage 1.5 already emitted.
9. Remove `isWordAllowed` filter inside `buildTreeFromLeaves` (`structural-builder.ts:983-988, 1056-1063`). Either keep `buildTreeFromLeaves` as a legacy/fallback path or delete it once `buildTreeFromModuleDecomposition` is universal.
10. Remove `deriveClassMandatoryCharacters` / `preferredWordIds` plumbing — the LLM owns this end-to-end now.

**Phase D — Delete the Phase 0 / demo / JSON skeletons.**

11. Delete `radical/phase-0-slice/`, `radical/demo/`, `radical/week-2..5/decomposition-*.json`. Remove the Phase 0 flag wiring in `index.ts:286-308, 1257-1274`. Remove imports.
12. Update memory drawer entries that reference the JSON files as the BoM source (search MEMORY.md for `decomposition-bess` references).

**Phase E — Promote character_id consultation index.**

13. Convert `MPN_HINTS_BY_CHARACTER` and `GRADE_D_BY_CHARACTER` (currently in `stages/4b-radical-resolution.ts:604, 738`) into the shared consultation index. No structural changes — these are already keyed by `character_id`.
14. The `character-hierarchy.ts` `WORDS` / `SENTENCES` tables become documentation-only — read by analytic dashboards only.

Each Phase A–E is independent and behind a feature flag. Promotion gate: BoM row count should monotonically increase as phases land. BESS target: 250-300 rows by end of Phase A.

---

## 9. Open questions

1. **Stage 1.5 prompt enforcement.** Does the Stage 1.5 LLM reliably emit ~5 `WordSpec` entries per `SubModuleSpec` for BESS? Need a measurement: log `naturalLanguageLayer.module_count` and `Σ sub_modules × words` per run to confirm we hit the ~300-leaf target after Phase A. If Stage 1.5 returns sparse `WordSpec[]` (e.g. only the content character without modifiers), the inversion just moves the bottleneck upstream.

2. **Per-class differentiation.** Today `character-hierarchy.ts` `allowed_classes` is the only place that enforces product-class scope (e.g. no `compressor_unit` on a drone). With the hierarchy demoted to a consultation index, **what stops Stage 1.5 from emitting wrong-class characters?** Options: (i) trust the LLM + a thin validator that warns if any emitted character_id has no `WORDS` entry; (ii) keep `allowed_classes` as a soft warning that surfaces unmapped characters but does not gate the tree.

3. **Quantity sourcing.** Today the topology multiplier is parsed from `word.modifier_characters` (`stages/2-decompose.ts:1422-1486`). After inversion, the same parser runs but at the LeafRecord-construction step. Confirm that Stage 1.5 modifier_characters[] is reliably populated with `kind:'quantity'` entries — current code already logs warnings when it isn't.

4. **Deterministic floor.** `deriveBessQuantityOverrides` / `deriveClassMandatoryCharacters` (`structural-builder.ts:180-931`) inject physics-derived characters that the LLM may have missed (e.g. exact cell count from energy / DoD / voltage / capacity). After inversion, does this floor still apply, or does Stage 1.5 own physics derivations too? Recommendation: keep the floor as a `LeafRecord[]` merge step in `leafRecordsFromModuleDecomposition`, not as a separate inject downstream — so the audit trail says "physics floor added X, LLM emitted Y".

5. **Sentence grouping when `module.module` is non-canonical.** Today the renderer assumes `sentence_id ∈ SENTENCES[]` so it can look up `label`, `allowed_classes`, etc. (`structural-builder.ts:1117-1118`, `7b-pdf-v3-radical-document.tsx:1898`). With `sentence_id ← module.module`, every `UniversalModule` becomes a valid `sentence_id`. Either map `module.module → SENTENCES[]` entry by 1:1 name lookup, or extend the renderer to fall back to `humaniseId(sentence_id)` when no entry exists. The latter is simpler and already supported by `humaniseId` in `sentence-generator.ts:136-153`.

6. **Phase 0 hardcoded costs.** `pipeline.ts:161-172` has a `BESS_KNOWN_COSTS` table used for the slice's mock resolution. Those 10 entries duplicate `GRADE_D_BY_CHARACTER` in `4b-radical-resolution.ts:738-787`. After deletion (Phase D step 11), the duplicate vanishes. Single source of truth: `GRADE_D_BY_CHARACTER`.

7. **Test impact.** `radical/__tests__/` and `stages/decompose-pa.test.ts` exercise `buildTreeFromLeaves` directly. Phases A–C must add coverage for `buildTreeFromModuleDecomposition` before retiring the legacy builder. Suggest a golden-file test: feed a known `ModuleDecomposition` and assert the resulting tree has the expected sub-module / word / leaf count.

---

## 10. Cost / time estimate

| Phase | Effort | Risk |
|---|---|---|
| A — new builder + flag | 0.5 day | low (additive, flag-gated) |
| B — Stage 2 enrichment-only | 1 day | medium (LLM prompt change) |
| C — drop gating | 0.5 day | low (removing redundant code) |
| D — delete Phase 0 + demo + JSON | 0.5 day | low (already dead code) |
| E — promote consultation index | 0.5 day | low (refactor / move) |

Total: ~3 days. Single biggest payoff is **Phase A** alone — flipping the tree builder will roughly triple BoM line count for BESS on day one.

---

## Appendix: file:line citations table

| Reference | File | Line(s) |
|---|---|---|
| Phase 0 slice flag check | `src/lib/pdf-engine-v2/radical/phase-0-slice/pipeline.ts` | 89-92 |
| Phase 0 slice runner | `src/lib/pdf-engine-v2/radical/phase-0-slice/pipeline.ts` | 124-283 |
| Phase 0 hardcoded tree | `src/lib/pdf-engine-v2/radical/phase-0-slice/bess-hardcoded-tree.ts` | 25-70 (BESS_MODULE_CHILDREN) |
| Phase 0 invocation | `src/lib/pdf-engine-v2/index.ts` | 286-308 |
| Phase 1 invocation | `src/lib/pdf-engine-v2/index.ts` | 1233-1281 |
| Phase 3 (per-module) invocation | `src/lib/pdf-engine-v2/index.ts` | 1086-1219 |
| Per-module Stage 2 | `src/lib/pdf-engine-v2/stages/2-decompose.ts` | 1532-1683 |
| Candidate library builder (per module) | `src/lib/pdf-engine-v2/stages/2-decompose.ts` | 1118-1148 |
| Out-of-scope leaf drop | `src/lib/pdf-engine-v2/stages/2-decompose.ts` | 1398-1420 |
| Topology multiplier propagation | `src/lib/pdf-engine-v2/stages/2-decompose.ts` | 1422-1486 |
| Tree builder | `src/lib/pdf-engine-v2/radical/structural-builder.ts` | 953-1235 |
| Class-allowed word filter | `src/lib/pdf-engine-v2/radical/structural-builder.ts` | 983-988, 1056-1063 |
| Within-word archetype dedup | `src/lib/pdf-engine-v2/radical/structural-builder.ts` | 1132-1148 |
| BESS-allowed sentences | `src/lib/pdf-engine-v2/radical/character-hierarchy.ts` | 144-211 |
| WORDS table (characters per word) | `src/lib/pdf-engine-v2/radical/character-hierarchy.ts` | 416-636 |
| WordSpec / ContentCharacter types | `src/lib/pdf-engine-v2/types/module-decomposition.ts` | 380-397 |
| Phase 2 resolution entry | `src/lib/pdf-engine-v2/stages/4b-radical-resolution.ts` | 1527-1679 |
| MPN_HINTS_BY_CHARACTER | `src/lib/pdf-engine-v2/stages/4b-radical-resolution.ts` | 604-706 |
| GRADE_D_BY_CHARACTER | `src/lib/pdf-engine-v2/stages/4b-radical-resolution.ts` | 738-1027 |
| §4 sub-module glyph render (already content_character-driven) | `src/lib/pdf-engine-v2/stages/7b-pdf-v3-radical-document.tsx` | 1898, 2338, 2090 |
| BESS decomposition JSON (orphaned) | `src/lib/pdf-engine-v2/radical/week-2/decomposition-bess.json` | (727 lines, 25 BoM rows) |
| Demo resolution importer | `src/lib/pdf-engine-v2/radical/demo/resolution.ts` | 20 |

---

## Council Remediation (2026-05-13, joint WS-A.B council)

Joint WS-A.B council BLOCKED with 2 NEEDS_MAJOR votes. WS-B's relevant remediation (SEAT 1 finding):

### R-B-C1 — `leafRecordsFromModuleDecomposition` quantity-modifier robustness

Current proposal (§6.2, §8.A.1): derive `multiplicity` from `word.modifier_characters.find(m => m.kind === 'quantity')`. If no quantity modifier present, silently default to 1.

For BESS: if 3 Tier 4 emitters disagree on whether to include `quantity` (1 emits ×3920, 2 omit), WS-A's union synthesis keeps the field with low confidence, but if all 3 omit OR the assembler dropped it, WS-B's silent `multiplicity = 1` would produce 3,920 cells rendered as ×1 per BoM row. Defeat-the-purpose.

**Required changes:**
1. `leafRecordsFromModuleDecomposition` MUST NOT silently default `multiplicity` to 1 when no quantity modifier present.
2. Emit the leaf with `multiplicity: null` + `verification_status: 'missing-quantity'`. This surfaces in QA reports without breaking the run.
3. Phase A acceptance criterion updated: "BoM rows ≥ 200 AND no rows with `multiplicity: null` for non-singleton parts" (singletons like enclosures legitimately have no quantity modifier).

### R-B-C2 — Empty words[] guard from Tier 4

WS-A §9 assembler allows empty `words[]`. WS-B's tree builder must:
1. Detect empty `words[]` per sub-module
2. Fall back to a deterministic stub (single `uncategorised` LeafRecord with `solid_state_of_matter` material radical, mirroring `1.7-module-decomposition.ts:924-944`)
3. Flag in `state.council_notes` so QA sees the gap
4. Never silently produce a gap that drops the BoM below target

### Phase A re-verification

The Phase A acceptance check ("BoM row count > 200 on iter-N") must also verify:
- No leaves with `multiplicity: null` for non-singleton parts (the §6 BoM `lfp_prismatic_cell` MUST emit at qty=3920, not null)
- No sub-modules contributing zero leaves (all 60 BESS sub-modules contribute at least one)

After WS-A + WS-B remediations land, re-council. Expected outcome: OK to begin.
