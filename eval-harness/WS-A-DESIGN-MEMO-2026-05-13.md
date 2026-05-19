# WS-A Design Memo — Splitting Stage 1.7 Module Decomposition into Three Tiers

**Date:** 2026-05-13
**Author:** Sub-agent (sonnet)
**Status:** Proposal for review
**Scope:** ForgeOS pdf-engine-v2 — decompose the monolithic Stage 1.7 module-decomposition LLM call into a sequential 3-tier pipeline (Tier 2 modules → Tier 3 sub-modules → Tier 4 parts/RAD/grammar) so each tier can be prompted, validated, and council-checked in isolation per §4.5 of the binding worked example.

---

## 0. Problem Statement (recap, with file:line cites)

Today, `src/lib/pdf-engine-v2/stages/1.7-module-decomposition.ts:1008-1242` (`runModuleDecomposition`) makes ONE LLM call that simultaneously emits:

1. **Module catalogue** — which of the 12 `UNIVERSAL_MODULES` apply, with `module_brief`, `derived_parameters`, `allowed_radicals`, `applicability_confidence`, `secondary_modules`, `cross_module_grammar_links` (`types/module-decomposition.ts:675-786`).
2. **Sub-modules per module** — 3-10 `SubModuleSpec` entries each with `id`, `name_human`, `role_verb`, `topology_clause`, intra-module `grammar_links` (`types/module-decomposition.ts:617-644` and the validator at `stages/1.7-module-decomposition.ts:323-488`).
3. **Words/parts per sub-module** — 1-9 `WordSpec` entries each carrying a `ContentCharacter` (with up to 4 radicals) plus 0-N `ModifyingCharacter` qualifiers (`types/module-decomposition.ts:380-397`, validator at `stages/1.7-module-decomposition.ts:365-477`).

The current prompt (`prompts.ts:655-` `MODULE_DECOMPOSITION_TAXONOMY_PROMPT`, ~600 lines including the BESS worked example) tries to teach the LLM all three jobs in one shot. Symptoms: the words[] cap dropped from 4 to 1 between iter-04 and iter-05 because the prompt drift was too easy in a single emission (see the inline note at `1.7-module-decomposition.ts:357-364`). BESS today emits ~101 BoM rows vs §6 binding target of ~300.

The §4.5 binding spec demands every sub-module produce: an English sentence, a RAD-syntax line (each word = one `content_character (modifiers...) ⊙ next_character (...)`), and explicit grammar links. **The BoM is derived: each `WordSpec.content_character.character_id` is one BoM row.** Splitting the work into three tiers lets each tier own one of those outputs with a focused prompt and its own council.

---

## 1. File Layout

**Decision: three new files. Keep `1.7-module-decomposition.ts` as a thin re-export shim for a phased migration.**

Proposed structure under `src/lib/pdf-engine-v2/stages/`:

```
1.7a-modules.ts            — Tier 2: per-product module catalogue (no sub_modules, no words)
1.7b-submodules.ts          — Tier 3: per-module sub-module decomposition (no words)
1.7c-parts-rad.ts           — Tier 4: per-sub-module parts + RAD line + cross-sub-module grammar
1.7-module-decomposition.ts — REDUCED to a backwards-compat shim that drives the 3-tier pipeline and re-assembles into the legacy `ModuleDecomposition` shape OR (preferred) deletes the monolithic call entirely behind a feature flag
```

Rationale for new filenames rather than renaming:
- The current file is exported by name in `index.ts:1095` (`runModuleDecomposition`) and tested by `stages/decompose-pa.test.ts` and `radical/__tests__/iter4-renderer-helpers.test.ts`. Keeping the legacy filename as a shim avoids a 1-day rename diff and lets us land each tier behind its own flag.
- The numbering `1.7a/b/c` slots cleanly between the existing `1b-regulatory.ts` and `2-decompose.ts` and mirrors the worked-example §4.5 sequencing.

Three associated helper files (or sub-sections of a single `prompts.ts`):

```
prompts/1.7a-modules.ts     — TAXONOMY_PROMPT (modules-only, no sub_modules block)
prompts/1.7b-submodules.ts  — SUBMODULE_DECOMPOSITION_PROMPT (one-module input)
prompts/1.7c-parts-rad.ts   — PARTS_RAD_PROMPT (one-sub-module input, §4.5 few-shot)
```

Alternative: keep all three additions inside the existing `prompts.ts` (currently 1332 lines) with a clear section banner per tier. I prefer the split — `prompts.ts` is already unwieldy.

---

## 2. Type Changes

The existing `ModuleSpec`, `SubModuleSpec`, `WordSpec` types are correct as the final assembled shape (downstream consumers like `radical/sentence-generator.ts:566` `buildNaturalLanguageLayer`, `radical/iter4-renderer-helpers.ts:80`, `radical/structural-builder.ts:1156-1167` all read `mod.sub_modules`, `sub.words`, `word.content_character`). Treat them as the **assembled output**; introduce three new **emission types** for the tier outputs:

```ts
// In types/module-decomposition.ts (additive, no breaking changes)

/** Tier 2 emission — module catalogue ONLY (no sub_modules, no words). */
export interface ModuleBrief {
  module: UniversalModule
  module_brief: string
  derived_parameters: DerivedParameters
  allowed_radicals: string[]
  applicability_confidence: ApplicabilityConfidence
  secondary_modules?: UniversalModule[]
  /** Hint for the Tier 3 sub-module prompt: which other modules this one couples to.
   *  NOT the canonical cross_module_grammar_links — those land in Tier 4. */
  expected_secondary_coupling?: UniversalModule[]
}

export interface Tier2Decomposition {
  product_class: string
  normalised_class: ProductClass | null
  modules: ModuleBrief[]
  excluded_modules: UniversalModule[]
  rationale_excluded: Partial<Record<UniversalModule, string>>
  council_verdict: CouncilVerdict
  council_seats: CouncilSeatReview[]
  council_notes: string[]
  telemetry: ModuleDecompositionTelemetry
}

/** Tier 3 emission — sub-modules for ONE module, no words yet. */
export interface SubModuleBrief {
  id: string
  name_human: string
  role_verb?: string
  topology_clause?: string
  /** 1-3 sentence plain-English description of what this sub-module is and does.
   *  This is the seed Tier 4 expands into the §4.5 English line. */
  sub_module_brief: string
  /** Intra-module grammar links sourced from this sub-module. Tier 3 emits these;
   *  Tier 4 may refine them with mechanism detail. */
  grammar_links_out: GrammarLink[]
}

export interface Tier3Decomposition {
  module: UniversalModule
  sub_modules: SubModuleBrief[]
  council_verdict: CouncilVerdict
  council_seats: CouncilSeatReview[]
  council_notes: string[]
  telemetry: ModuleDecompositionTelemetry
}

/** Tier 4 emission — parts/words + RAD line + cross-sub-module grammar for ONE sub-module. */
export interface PartsRadEmission {
  module: UniversalModule
  sub_module_id: string
  /** The §4.5 English line — one or two sentences describing what this sub-module
   *  is made of. Drives both the PDF prose and the LLM-paragraph fallback. */
  english_sentence: string
  /** The RAD-syntax words (becomes SubModuleSpec.words downstream). */
  words: WordSpec[]
  /** Cross-sub-module grammar this sub-module participates in. Both intra-module
   *  (refining what Tier 3 emitted) AND outbound cross-module links. */
  grammar_links: GrammarLink[]
  cross_module_grammar_links: CrossModuleGrammarLink[]
  council_verdict: CouncilVerdict
  council_seats: CouncilSeatReview[]
  council_notes: string[]
  telemetry: ModuleDecompositionTelemetry
}
```

The existing `ModuleDecomposition` (`types/module-decomposition.ts:872-939`) and `ModuleSpec` stay untouched — Step 9 below shows how the 3-tier outputs get assembled into the same shape so downstream consumers (`radical/iter4-renderer-helpers.ts:48`, `radical/structural-builder.ts:1156`, `stages/7b-pdf-v3-radical-document.tsx:1514+`) require no changes.

Do NOT split `ModuleSpec` itself. Splitting it would force a rewrite of 4+ downstream consumers (`sentence-generator.ts`, `iter4-renderer-helpers.ts`, `structural-builder.ts`, the PDF document) for zero benefit. The assembled shape is correct; only the *production* path changes.

---

## 3. Orchestrator Wiring

The current call site is `src/lib/pdf-engine-v2/index.ts:1086-1219`. The proposed shape replaces lines 1094-1113 with:

```ts
// Pseudocode — replaces the single runModuleDecomposition call

// ── TIER 2 ──────────────────────────────────────────────────────────────
const tier2 = await runTier2Modules(state.parsedBrief, productClassForRadical, state.regulatoryExtraction)
if (!tier2.ok || !tier2.data) { /* fall back to ClassModulePriors as today */ }
const moduleBriefs = tier2.data.modules

// ── TIER 3 — parallel fan-out, one call per module ───────────────────────
const tier3Results = await Promise.all(
  moduleBriefs.map(mb => runTier3SubModules(mb, state.parsedBrief, productClassForRadical))
)
// Each tier3Results[i] is Tier3Decomposition for moduleBriefs[i]

// ── TIER 4 — parallel fan-out, one call per sub-module ───────────────────
// For 10 modules × ~6 sub-modules = ~60 invocations. Bound concurrency to ≤8
// per the cost-discipline rule (memory: forgeos_per_project_concurrency_multiplies).
const allInvocations: Array<[ModuleBrief, SubModuleBrief]> = []
for (let i = 0; i < moduleBriefs.length; i++) {
  for (const sub of tier3Results[i].sub_modules) {
    allInvocations.push([moduleBriefs[i], sub])
  }
}
const tier4Results = await runWithConcurrency(allInvocations, 8, ([mb, sub]) =>
  runTier4PartsRad(mb, sub, state.parsedBrief, productClassForRadical)
)

// ── ASSEMBLE legacy ModuleDecomposition shape ────────────────────────────
state.moduleDecomposition = assembleModuleDecomposition(tier2.data, tier3Results, tier4Results)
// ↑ produces the same ModuleDecomposition shape consumers already read.
```

**Parallelisation points:**

- **Tier 3:** all module calls parallel — they share no state (module N's sub-modules don't depend on module M's). Wall-clock = max(per-module duration). 10 modules × ~30s each = ~30s wall-clock vs 300s serial.
- **Tier 4:** all sub-module calls parallel, capped at 8 concurrent. With 60 invocations at ~20s each, wall-clock ≈ ceil(60/8) × 20 = ~150s. OpenRouter has been demonstrably happy with 8-way concurrency in the current per-module Stage 2 path (`stages/2-decompose.ts:1182-1282`).
- **Council seats within a tier:** stay parallel as today (`1.7-module-decomposition.ts:833-862`).

---

## 4. State Propagation

Current state field set (`pdf-engine-v2/types.ts:791-799`):

```ts
moduleDecomposition?: ModuleDecomposition
naturalLanguageLayer?: NaturalLanguageLayer
```

These are consumed by the PDF renderer (`stages/7b-pdf-v3-radical-document.tsx:1514, 1788, 2218, 2369`) and the structural builder. **Both must continue to be populated for backward compatibility.** Don't replace; add tier-staged state alongside, then assemble into the legacy shape:

```ts
// Additions to PipelineState (pdf-engine-v2/types.ts ≈ line 791)
tier2Decomposition?: Tier2Decomposition
tier3Decompositions?: Record<UniversalModule, Tier3Decomposition>
tier4Emissions?: Record<string /* `${module}::${sub_module_id}` */, PartsRadEmission>

// Existing fields STILL populated (by the assembler):
moduleDecomposition?: ModuleDecomposition     // ← assembleModuleDecomposition output
naturalLanguageLayer?: NaturalLanguageLayer   // ← same buildNaturalLanguageLayer call
```

Why keep all four fields:
- Debugging / replay: when Tier 4 misbehaves for one sub-module, having the upstream tier outputs cached on state means we can re-run just Tier 4 without re-firing Tier 2/3.
- Failover: if Tier 4 fails for a single sub-module, the assembler can fall back to a deterministic word list (e.g. ClassModulePriors expanded with the BESS skeleton or whatever the heuristic is) for that one sub-module without dropping the entire pipeline.
- Snapshot persistence: `state.json` already serialises `moduleDecomposition` and `naturalLanguageLayer` (see `index.ts:2037-2041`); add the three tier fields for diagnostic forensics.

---

## 5. Prompts

**Decision: each tier owns its own prompt file under `prompts/`.** Move `MODULE_DECOMPOSITION_TAXONOMY_PROMPT` (`prompts.ts:655-1230`) and `MODULE_DECOMPOSITION_COUNCIL_PROMPT` (`prompts.ts:1231-1276`) into the new layout:

```
prompts/index.ts                 — re-exports current symbols + the new tier prompts
prompts/1.7a-modules.ts          — TIER2_MODULES_TAXONOMY_PROMPT + TIER2_COUNCIL_PROMPT
prompts/1.7b-submodules.ts       — TIER3_SUBMODULE_DECOMPOSITION_PROMPT + TIER3_COUNCIL_PROMPT
prompts/1.7c-parts-rad.ts        — TIER4_PARTS_RAD_PROMPT + TIER4_COUNCIL_PROMPT
prompts/shared-radical-glossary.ts — the 22-radical alphabet + 26-mechanism vocabulary
                                     (used by all three tiers — extract once, import three times)
```

Why extract the shared glossary: today the 22 content radicals and 26 grammar mechanisms are inlined into `MODULE_DECOMPOSITION_TAXONOMY_PROMPT` (`prompts.ts:724-805`). Three tiers each need them; deduplicating into a single file lets us update the alphabet in one place when Week 6+ adds new radicals.

Each tier's prompt should be **half the length** of the current monolith because:
- Tier 2 doesn't need the WordSpec/ModifierCharacter/§4.5 worked example — drop ~400 lines.
- Tier 3 sees one module as input, doesn't need the 12-module taxonomy — drop ~300 lines.
- Tier 4 sees one sub-module as input, doesn't need the 12-module taxonomy or the sub-module schema — drop ~200 lines but gain a much richer §4.5 few-shot.

---

## 6. Few-Shot Examples

Three new few-shots, each living next to its prompt:

### Tier 2 few-shot
- Input: the BESS brief excerpt (already in `prompts.ts:826+`).
- Output: 8 modules + 4 excluded, no `sub_modules` field at all. Show the module_brief, derived_parameters, allowed_radicals refinement, applicability_confidence, secondary_modules, and `expected_secondary_coupling` (the new Tier-2 cross-module hint).
- Length budget: ~80 lines of JSON.

### Tier 3 few-shot
- Input: ONE ModuleBrief (the BESS `energy_storage_source` brief from above).
- Output: 6 sub-module briefs — `cell_string`, `rack_structure`, `bms_slave`, `bms_master`, `dc_distribution`, `pack_instrumentation` — each with `sub_module_brief` (1-3 sentences) + intra-module `grammar_links_out`. NO words yet.
- Length budget: ~120 lines of JSON.

### Tier 4 few-shot (THE CRITICAL ONE)
- Input: ONE `SubModuleBrief` (the BESS `cell_string` brief).
- Output: the EXACT §4.5 shape Tristan binding-specced:
  - `english_sentence`: "The cell string consists of 3,920 LFP prismatic cells (CATL 280 Ah, 3.2 V nominal) wired in 112 modules of 35 cells in series, with 3,808 cell-to-cell busbars rated 350 A inter-cell, terminal hardware sets, voltage-tap wires, and insulation pads."
  - `words`: **5 WordSpec entries** matching §6 binding (`lfp_prismatic_cell`, `cell_to_cell_busbar`, `cell_terminal_hardware_set`, `cell_voltage_tap_wire`, `cell_insulation_pad`). Each with full content_character (1-2 radicals each) + 3-7 modifiers per the §4.5 sample.
  - `grammar_links`: ≥1 link to `rack_structure` (mechanical_mount).
  - `cross_module_grammar_links`: ≥1 link to `environmental_interface` (cooling_loop).
- Length budget: ~300 lines of JSON (this is the high-value teaching shot).

Few-shots live as `.ts` files (`prompts/1.7c-parts-rad-fewshot.ts`) exporting a const string. Keeping them as TypeScript-string-literals not JSON files means TypeScript stays in the loop on import paths and lets the prompt file template them in without runtime fetch.

---

## 7. Synthesis Layer (per tier)

Each tier has 3 emitters + 1 checker. Synthesis is structurally similar across tiers; abstract it into `radical/council-synthesis.ts`:

```ts
export function synthesiseTierEmissions<T>(
  emissions: Array<{ ok: boolean; data?: T; model: string }>,
  checker: { ok: boolean; verdict: CouncilVerdict; notes: string[]; model: string },
  options: {
    unionFields: (keyof T)[]      // arrays → de-duped union
    intersectionFields: (keyof T)[] // arrays → only items in ALL emitters
    medianFields: (keyof T)[]      // numbers → median across emitters
    flagDisagreement: (keyof T)[]  // log when emitters disagree; downgrade confidence
  },
): { synthesised: T; confidence: 'high' | 'medium' | 'low'; disagreements: string[] }
```

Concrete per-tier rules:

**Tier 2:** Modules list = **majority vote** (a module is included if ≥2 of 3 emitters list it). Excluded list = `UNIVERSAL_MODULES` minus included. `module_brief` = take the longest of the 3 emissions (proxy for most-thoroughly-written). `derived_parameters` = numeric **median** of the three; string params = vote (modal value). `allowed_radicals` = **union** but checker's NEEDS_MAJOR flag drops any radical only 1 emitter listed.

**Tier 3:** `sub_modules` list = **union** of ids across the 3 emitters (a sub-module the BESS cell_string is real if even one emitter lists it). For each shared sub-module, `sub_module_brief` = pick the longest. `grammar_links_out` = union with mechanism normalised. Disagreements (one emitter calls it `cell_string`, another `cell_array`) get flagged for human review but **the engine picks alphabetically first** for determinism.

**Tier 4:** `words` list = **majority vote** by `content_character.character_id` (a part is real if ≥2 of 3 emitters emit it under the same character_id). Modifiers per word:
- **`quantity` modifier requires ≥2 of 3 emitters to agree** on the value (council R-C2 mandate — silent default to 1 would produce 3,920 cells as ×1 for BESS). If <2 agree on quantity, the assembler emits the leaf with `multiplicity: null` + `verification_status: 'missing-quantity'` so it surfaces in QA. If only 1 emitter provides a quantity, use that value but tag the leaf `confidence: 'low'`.
- **Singleton exception:** parts that legitimately have no `quantity` modifier (enclosures, single chassis components) carry `quantity: null` by design — they do NOT trigger the missing-quantity flag. The assembler checks `subModule.role_verb` or singleton hint to distinguish.
- **Numeric disagreement (e.g. ×3920 vs ×3808):** when ≥2 agree on one value, that value wins; the dissenter is logged. When all 3 disagree, the leaf gets `multiplicity: null` + flag for human review — never a silent median.
- Other modifier kinds (cap, form, top, dim, life, reg) = **union** with the original median-on-numeric-conflict rule. Council requires strict-quantity-only — other modifiers can median safely.

`english_sentence` = longest emission. `rad_syntax` = longest emission (verbatim string used for §4.5 PDF block + audit trail). Grammar links = union.

Checker (4th seat) overrides:
- NEEDS_MAJOR on Tier 2 → re-run Tier 2 once with checker notes appended.
- NEEDS_MAJOR on Tier 3 → re-run ONLY the affected module's Tier 3 (not all 10).
- NEEDS_MAJOR on Tier 4 → re-run ONLY the affected sub-module's Tier 4.

This per-tier isolation is the key cost-discipline win — today a NEEDS_MAJOR on any aspect re-runs the entire monolith (`1.7-module-decomposition.ts:1128-1211`).

---

## 8. BoM Derivation

Today, the BoM is derived by `radical/structural-builder.ts:buildTreeFromLeaves` (line 953+) consuming `LeafRecord[]` from `state.radicalTree`, which is populated by the per-module Stage 2 path (`stages/2-decompose.ts:runDecomposeRadicalPerModule`). The structural-builder consumes leaves stamped with `sub_module_id` and `word_id` (`structural-builder.ts:1156-1167`) and groups them under the matching sub-module dividers.

**New flow:** Tier 4's `PartsRadEmission.words[]` becomes the LeafRecord source directly. Each `WordSpec` in Tier 4 maps to one `LeafRecord`:

```ts
function tier4WordToLeafRecord(
  module: UniversalModule,
  sub_module_id: string,
  word: WordSpec,
): LeafRecord {
  return {
    character_id: word.content_character.character_id,
    archetype_id: null,           // archetype resolution stays in 4b-radical-resolution
    // Council R-C2 fix (2026-05-13): no silent default to 1. When quantity is
    // missing AND this isn't a singleton (single-chassis component), emit
    // multiplicity=null + flag in verification_status. This surfaces 3,920-cell
    // mis-counts in QA instead of rendering as ×1.
    multiplicity: extractQuantity(word.modifier_characters),  // returns number | null
    mpn_hint: null,
    manufacturer_hint: null,
    estimated_unit_price_gbp: null,
    description: word.name_human || null,
    verification_status: extractQuantity(word.modifier_characters) === null && !isSingleton(word) ? 'missing-quantity' : null,
    sub_module_id,
    word_id: word.id,
  }
  // Note: extractQuantity returns number | null (NOT number with ?? 1 default).
  // isSingleton checks word for singleton hint — e.g. content_character with no
  // expected quantity modifier per the canonical character library, or sub-module
  // role_verb='contains_one'.
}
```

Plumbing change in `stages/2-decompose.ts:runDecomposeRadicalPerModule` (line ≈1072+): when `RADICAL_PHASE_3_PER_MODULE` is on AND tier4 emissions are present on state, skip the per-module LLM call entirely and synthesise the LeafRecord[] from `state.tier4Emissions`. The structural-builder consumes them unchanged; everything downstream (`stages/4b-radical-resolution.ts:10` — `Input: state.radicalTree`) is untouched.

**Net change to structural-builder: zero.** Net change to BoM stage 4b: zero. The leaf-record contract is the integration point that buys backwards compatibility.

One nuance: today's per-module Stage 2 path also surfaces `mpn_hint`, `manufacturer_hint`, `estimated_unit_price_gbp` on leaves. Tier 4 emissions could carry these too if we extend `WordSpec` (or stash them in `modifier_characters` with `kind: 'mpn_hint'`). Suggest deferring — the post-emission Stage 4b LLM resolver fills these in. Don't conflate Tier 4's job (RAD line + grammar) with Stage 4b's job (commercial enrichment).

---

## 9. Backward Compatibility

Three layers of consumer code depend on the legacy `state.moduleDecomposition` shape:

1. **PA Stage 5 path** — `index.ts:2037` serialises `moduleDecomposition: state.moduleDecomposition ?? null` into the snapshot. As long as the assembler still populates `state.moduleDecomposition` from the three tier outputs, this works.
2. **Natural-language layer** — `radical/sentence-generator.ts:566` `buildNaturalLanguageLayer(modules: ReadonlyArray<ModuleSpec>)` reads `sub_modules`, `words`, `content_character`, `grammar_links`. The assembler MUST produce a faithful `ModuleSpec[]`; once it does, this stays untouched.
3. **PDF renderer / iter4-renderer-helpers** — `radical/iter4-renderer-helpers.ts:48` reads `(state as { moduleDecomposition?: unknown }).moduleDecomposition`. Same: needs the legacy shape populated.
4. **Phase 0 slice / training-data gate** — uses `state.moduleDecomposition.modules` count for FmEA padding. Assembler still produces this.

**Assembler contract** (the function bridging tier outputs → legacy shape):

```ts
export function assembleModuleDecomposition(
  tier2: Tier2Decomposition,
  tier3: Record<UniversalModule, Tier3Decomposition>,
  tier4: Record<string, PartsRadEmission>,  // key = `${module}::${sub_id}`
): ModuleDecomposition {
  const modules: ModuleSpec[] = tier2.modules.map(mb => {
    const subBriefs = tier3[mb.module]?.sub_modules ?? []
    const sub_modules: SubModuleSpec[] = subBriefs.map(sb => {
      const t4 = tier4[`${mb.module}::${sb.id}`]
      // Council R-C1 fix (2026-05-13): propagate english_sentence + rad_syntax
      // from Tier 4 into the assembled SubModuleSpec so downstream
      // (sentence-generator, §4.5 PDF renderer) can read them. Without this,
      // Tier 4's £4.80/run LLM output is dropped on the floor.
      // Council R-C2 fix: empty words[] → log in council_notes (handled in
      // tier4WordToLeafRecord callsite), do NOT silent-pass through.
      if (!t4 || !t4.words || t4.words.length === 0) {
        councilNotes.push(`Tier 4 missing/empty words for ${mb.module}::${sb.id} — falling back to deterministic stub`)
      }
      return {
        id: sb.id,
        name_human: sb.name_human,
        words: t4?.words ?? [],
        role_verb: sb.role_verb,
        topology_clause: sb.topology_clause,
        english_sentence: t4?.english_sentence,    // R-C1 (1): NEW field — LLM-emitted English from §4.5
        rad_syntax: t4?.rad_syntax,                // R-C1 (2): NEW field — verbatim RAD string for §4.5 PDF block
      }
    })
    const grammar_links = mergeGrammarLinks(
      subBriefs.flatMap(sb => sb.grammar_links_out),
      subBriefs.flatMap(sb => tier4[`${mb.module}::${sb.id}`]?.grammar_links ?? []),
    )
    return {
      module: mb.module,
      module_brief: mb.module_brief,
      derived_parameters: mb.derived_parameters,
      allowed_radicals: mb.allowed_radicals,
      applicability_confidence: mb.applicability_confidence,
      secondary_modules: mb.secondary_modules,
      sub_modules,
      grammar_links,
    }
  })

  const cross_module_grammar_links = mergeCrossModuleLinks(
    Object.values(tier4).flatMap(t => t.cross_module_grammar_links),
  )

  return {
    product_class: tier2.product_class,
    normalised_class: tier2.normalised_class,
    modules,
    excluded_modules: tier2.excluded_modules,
    rationale_excluded: tier2.rationale_excluded,
    cross_module_grammar_links,
    council_verdict: worstVerdict([tier2.council_verdict, ...Object.values(tier3).map(t => t.council_verdict), ...Object.values(tier4).map(t => t.council_verdict)]),
    council_seats: [...tier2.council_seats, ...flatten(tier3 seats), ...flatten(tier4 seats)],
    council_notes: [...tier2.council_notes, ...flatten(tier3 notes), ...flatten(tier4 notes)],
    telemetry: sumTelemetry(...),
  }
}
```

Feature-flag gating: introduce `RADICAL_TIERED_DECOMPOSITION=true`. When OFF, `1.7-module-decomposition.ts` runs the old monolith unchanged. When ON, it dispatches the 3-tier path. Default OFF for two iterations; once tier-stack scores ≥8/10 council on BESS + one other class, flip default.

---

## 10. Implementation Steps (ordered)

1. **Add tier emission types** to `types/module-decomposition.ts` (additive only — `ModuleBrief`, `Tier2Decomposition`, `SubModuleBrief`, `Tier3Decomposition`, `PartsRadEmission`). No breaking changes; existing types stay.
2. **Extract shared glossary** into `prompts/shared-radical-glossary.ts` (the 22 radicals + 26 mechanisms + 12 module definitions, all currently inlined in `prompts.ts:672-805`).
3. **Write `prompts/1.7a-modules.ts`** — Tier 2 prompt + council prompt + few-shot. Strip everything sub-module-level and word-level from the current taxonomy prompt.
4. **Implement `stages/1.7a-modules.ts`** with `runTier2Modules()`. Mirror the current LLM transport / validation / retry / council pattern from `1.7-module-decomposition.ts:135-228, 234-722, 823-886` but emit only `ModuleBrief[]`. Reuse `CLASS_MODULE_PRIORS` cross-check unchanged.
5. **Unit-test Tier 2 in isolation** — feed BESS brief, assert 8 modules including `energy_storage_source`, no `sub_modules` in output.
6. **Write `prompts/1.7b-submodules.ts`** — Tier 3 prompt taking ONE `ModuleBrief` as input.
7. **Implement `stages/1.7b-submodules.ts`** with `runTier3SubModules(moduleBrief, parsedBrief, productClass)`. One Tier 3 call per module; council 3+1 same pattern.
8. **Unit-test Tier 3 in isolation** — feed BESS `energy_storage_source` brief, assert 6 sub-module briefs matching §6 worked example.
9. **Write `prompts/1.7c-parts-rad.ts`** with the high-value §4.5 few-shot. This is the prompt where the most prompt-engineering effort lands.
10. **Implement `stages/1.7c-parts-rad.ts`** with `runTier4PartsRad(moduleBrief, subModuleBrief, parsedBrief, productClass)`. Emits `PartsRadEmission`.
11. **Unit-test Tier 4 in isolation** — feed `cell_string` sub-module brief; assert 5 words matching §6, ≥1 grammar_link, ≥1 cross_module_grammar_link.
12. **Implement `assembleModuleDecomposition()`** in a new `stages/1.7-assembler.ts` (or inside the shim `1.7-module-decomposition.ts`).
13. **Add concurrency-bounded fan-out helper** (`radical/concurrency.ts:runWithConcurrency`) if one doesn't exist; cap at 8.
14. **Refactor `index.ts:1086-1219`** to dispatch the 3-tier pipeline when `RADICAL_TIERED_DECOMPOSITION=true`. Keep the monolith path behind the OFF branch for one iteration.
15. **End-to-end smoke test** on BESS brief — assert ~300 BoM rows downstream (per §6 binding), council ≥8/10 on all three tiers, no PDF renderer breakage.
16. **Run on one other class** (say RO desal or HAPS) — universality probe.
17. **Flip default flag to ON** once two classes hit ≥8/10. Delete the monolith code path one iteration later (Tier 2/3/4 become the only path).

Estimated diff: ~2,500 lines added, ~600 removed, ~200 line orchestrator refactor. 3-4 working sessions if dispatched as parallel sonnet tasks (Step 4, 7, 10 are independent and each ~1 session).

---

## 11. Risks + Open Questions

**R1 — Cost ceiling.** Today's monolith is one ~150k-token call. The new pipeline is ~1 (Tier 2) + ~10 (Tier 3) + ~60 (Tier 4) = 71 LLM emission calls × 3 emitters + 71 checker calls = **~284 LLM calls per BESS pipeline run.** At 150k max-tokens budget per call, worst-case input+output cost could be ~£15-25 per run vs ~£2 today. Mitigation: Tier 3 calls don't need 150k (single module input is ~5k tokens) — cap each tier's `max_tokens` realistically. Tier 4 calls don't need 150k either. Budget enforcement: Tier 2 at 60k, Tier 3 at 20k, Tier 4 at 30k.

**R2 — One bad sub-module blocks pipeline.** Today a single fail in the monolith retries the whole thing once and falls back to ClassModulePriors. With 60 Tier 4 calls, if any one returns NEEDS_MAJOR twice, the assembler should still produce a complete ModuleDecomposition by falling back to a deterministic "stub word" (`uncategorised` LeafRecord with `solid_state_of_matter` radical, mirroring `1.7-module-decomposition.ts:924-944`). Specify: "single Tier-4 sub-module failure is non-fatal; assembler emits stub words + flags in council_notes."

**R3 — Grammar link consistency.** Tier 3 emits `grammar_links_out` per sub-module brief. Tier 4 also emits `grammar_links` per sub-module. The assembler MUST de-duplicate / reconcile. Open: when Tier 3 says `cell_string → rack_structure via mechanical_mount` but Tier 4 says `cell_string → rack_structure via pcb_mounting`, which wins? Suggest: Tier 4 wins because it has the most-specific knowledge of the parts. Document this in the assembler.

**R4 — Cross-module grammar gets fragmented.** `CrossModuleGrammarLink[]` is currently a single top-level array (`types/module-decomposition.ts:928-933`). With Tier 4 emitting cross-module links per sub-module, the assembler unions them. Open: do we still need Tier 2 to emit `expected_secondary_coupling`? Probably YES because Tier 3 and Tier 4 need the hint to know which neighbouring modules to consider when emitting grammar links. Keep it.

**R5 — Test fixture rot.** `stages/decompose-pa.test.ts`, `stages/council-blocker-3-4.test.ts` and `radical/__tests__/iter4-renderer-helpers.test.ts` consume the old monolith. They'll break unless the shim assembles output identical-enough. Plan: pin the 3-tier mode behind the flag, leave tests on the monolith path until Step 17.

**R6 — Council seat consistency.** Plan v3 says different model rosters per tier (`Gemini+Grok+Qwen / Grok+Gemini+MiMo / Gemini+Qwen+MiMo` with `GLM/GLM/Grok` checking). Risk: when a model API outage hits, several tiers in flight may all fail simultaneously. Today there's only one call to fail. Mitigation: cache last-known-good model fallback per tier (already done in `callOpenRouterJson` at `1.7-module-decomposition.ts:144`).

**R7 — Open Question: does Tier 4 supersede the deterministic `generateSubmoduleSentence`?** Today `sentence-generator.ts:generateSubmoduleSentence` (line 576) builds the English sentence deterministically from `SubModuleSpec.words`. If Tier 4 also emits `english_sentence`, we have two sources. Suggest: Tier 4's `english_sentence` becomes the canonical PDF sentence; `generateSubmoduleSentence` stays as the **deterministic fallback** (when Tier 4 fails or for unit-test stability) and as the round-trip parser target in Iter 5. Both kept; LLM output preferred when present.

**R8 — Open Question: where does Stage-2 per-module LLM call go?** Today `stages/2-decompose.ts:runDecomposeRadicalPerModule` makes one LLM call per module to emit `LeafRecord[]`. Once Tier 4 emits `WordSpec[]` per sub-module, the per-module Stage 2 LLM call is **redundant** — Tier 4 already produces the leaves. Suggest: when `RADICAL_TIERED_DECOMPOSITION=true`, skip `runDecomposeRadicalPerModule` and synthesise `state.radicalTree` directly from Tier 4 emissions via `buildTreeFromLeaves`. Saves ~10 LLM calls per pipeline run. Otherwise the same character-id contract holds and Stage 4b works unchanged.

**R9 — Open Question: is `expected_secondary_coupling` overkill?** Tier 2 currently emits `cross_module_grammar_links` directly. The 3-tier split moves that to Tier 4. But Tier 3 (sub-module decomposition) needs SOME hint of which adjacent modules exist so it can plausibly emit intra-module sub-modules that have outbound coupling targets. Two options: (a) pass the full `tier2.modules` list as context to Tier 3, (b) have Tier 2 emit `expected_secondary_coupling: UniversalModule[]` as a lightweight hint. Option (a) is cleaner — Tier 3 always sees the full set of included modules so it knows what's available to link to. Drop `expected_secondary_coupling` from `ModuleBrief`. Simplification.

**R10 — Concurrency interaction with engine-watchdog drift detection.** The autonomous turn-start rule (`~/.engine-progress`) tracks `mins_since_commit`. A 60-call Tier 4 fan-out at 8-way concurrency could stall the watchdog if it eats 5+ minutes wall-clock with no commits. Suggest: emit a synthetic commit ("WIP: tier 4 N/60 sub-modules complete") every 10 sub-modules so drift doesn't trip falsely. Or document this as expected behaviour and tune the threshold.

---

## 12. Net Verdict

**Confidence: high.** This is the right split. Worked-example §4.5 demands one English sentence + one RAD line + grammar per sub-module — and the current monolith is provably underdelivering (BESS 101 BoM rows vs target 300). Three tiers, each with a focused prompt + few-shot + council, will let each layer hit its own quality bar without cross-contamination.

**Confidence: moderate on cost.** Worst-case 5-10× cost increase per pipeline run. Per-tier `max_tokens` caps and Tier 3 / Tier 4 right-sizing make this manageable but it's a real risk that needs measurement on iteration 1.

**Confidence: high on backward compatibility.** Keeping `ModuleSpec` / `ModuleDecomposition` / `NaturalLanguageLayer` as the assembled output means zero changes to `sentence-generator.ts`, `iter4-renderer-helpers.ts`, `structural-builder.ts`, the PDF renderer, or Stage 4b. The assembler is the entire abstraction layer.

**Recommended order:** flag-gated rollout via `RADICAL_TIERED_DECOMPOSITION=true`. Land Steps 1-15 behind the flag. Don't delete the monolith until two product classes hit ≥8/10 council on the new path.

---

## 13. Council Remediation (2026-05-13)

The joint WS-A.B council BLOCKED with 2 NEEDS_MAJOR votes. Both findings catch defeat-the-purpose holes that would have wasted ~£40 in iteration runs. Remediations agreed below; the council's "expected outcome OK to begin" applies once these are in.

### R-C1 — english_sentence + rad_syntax MUST flow downstream (SEAT 3 NEEDS_MAJOR)

Grep confirmed: ZERO matches for `english_sentence` or `rad_syntax` anywhere in `src/`. Tier 4 would emit them, the assembler would drop them on the floor (legacy `ModuleSpec` has no slot), and `generateSubmoduleSentence` would STILL build English deterministically from `words[]`. The £4.80/run Tier 4 LLM output for English+RAD would be ignored. Defeat-the-purpose.

**Required changes:**
1. Add `english_sentence?: string` to `SubModuleSpec` (`types/module-decomposition.ts:617-644`). Optional for backward compatibility with the monolith path.
2. Add `rad_syntax?: string` to `SubModuleSpec` for audit-trail + §4.5 PDF block rendering.
3. Update `generateSubmoduleSentence` (`radical/sentence-generator.ts:269`) to PREFER `subModule.english_sentence` when present, fall back to deterministic generation otherwise.
4. Update `7b-pdf-v3-radical-document.tsx` §4.5 SentenceParagraphViewPage to render `subModule.rad_syntax` below the English sentence (matching the worked-example §4.5 RAD line).
5. Assembler in §9 MUST propagate `english_sentence` and `rad_syntax` from `PartsRadEmission` into the assembled `SubModuleSpec`.

### R-C2 — Quantity-modifier robustness + empty-words fallback (SEAT 1 NEEDS_MAJOR)

WS-B's `leafRecordsFromModuleDecomposition` (memo §8.A.1) silently defaults `multiplicity = 1` when no `quantity` modifier present. For BESS this would produce 3,920 cells as ×1. Plus WS-A's assembler at §9 line 348 allows empty `words[]` — 5/60 empty sub-modules → BoM ~275 with silent gaps.

**Required changes:**
1. `leafRecordsFromModuleDecomposition` in WS-B MUST throw or stub-and-flag when `quantity` modifier is missing on a word. Stub-and-flag preferred: emit the leaf with `multiplicity: null` + `verification_status: 'missing-quantity'` so it surfaces in QA without breaking the run.
2. Tier 4 synthesis (WS-A §7) MUST require ≥2 of 3 emitters to agree on quantity for it to be included. If <2 agree, the assembler flags it for review and uses the highest-confidence single emitter's value with a `confidence: 'low'` tag.
3. Empty `words[]` from a Tier 4 sub-module triggers the deterministic stub fallback (per R2 already documented) — emit `uncategorised` LeafRecord + flag, never silent gap.

### R-C3 — Checker-vs-majority tiebreak rule (SEAT 5 NEEDS_MINOR)

WS-A §7 specifies the synthesis rules but doesn't specify what happens when the checker disagrees with a 3/3 emitter majority.

**Required addition to §7:** "When the checker returns NEEDS_MAJOR but ≥2 emitters agree on the disputed field, the EMITTERS WIN by default. The checker's NEEDS_MAJOR vote is logged in `council_notes` but does not override the synthesised value, UNLESS the checker cites a specific schema violation (e.g. invalid radical_id, duplicate sub_module id, malformed RAD string). Schema violations always win regardless of emitter consensus."

### R-C4 — Wall-clock + engine-watchdog (SEAT 4 NEEDS_MINOR)

R10 (synthetic WIP commit every 10 sub-modules) was overkill. Independent council math: 60 sub-modules / 8 concurrent × 20s avg ≈ 150 seconds wall-clock. Drops R10. Document expected ~3-min wall-clock for Tier 4 in §3.

### R-C5 — Tier 6 dependency confirmation (SEAT 6 NEEDS_MINOR)

Add one sentence to §12: "Tier 6 (Assembly Partner Discovery, see WS-F) consumes the assembled `ModuleDecomposition.modules[]` + `cross_module_grammar_links[]` + `subModules[].words[].content_character` directly — no upstream changes required for Tier 6 implementation."

### Re-vote expected

Per council Seat 7: "After remediation, re-vote — expected outcome OK to begin." These remediations are mechanical edits to the memo + types. A single 30-second re-council run confirms before implementation.
