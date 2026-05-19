/**
 * @file structural-builder-from-decomposition.ts — WS-B Phase A builder.
 *
 * Builds the RadicalTree DIRECTLY from `ModuleDecomposition` (Stage 1.7 LLM
 * emission) rather than via the legacy `WORDS[]`/`SENTENCES[]` hierarchy
 * filter in `structural-builder.ts:buildTreeFromLeaves`.
 *
 * Why: the legacy path caps the BoM at ~101-102 leaves for BESS because
 * `isWordAllowed` filters every leaf against the hardcoded `character-
 * hierarchy.ts:WORDS[]` table (lines 416-636). Iter-07 evidence (commit
 * 7b9c010d, multi-emitter + UNION synthesis) showed the LLM emitting 112
 * sub-modules × ~4.8 words = 533 distinct content character_ids — but only
 * 101 made it through the filter, causing §6 BoM to mis-map to the rich
 * §4/§4.5 content and tanking multimodal scores (8.31 → 7.83 iter-04 → iter-07).
 *
 * Inversion: the Tier 4 emission is now the source of truth for tree shape.
 *   sentence_id ← module.module    (UniversalModule key)
 *   word_id     ← sub_module.id    (SubModuleSpec.id)
 *   leaf        ← word             (one BoM row per WordSpec.content_character)
 *
 * No `WORDS[]` lookup. Unknown character_ids degrade gracefully in Phase 2
 * resolution via the existing `findEntriesByPartTerm` fallback.
 *
 * Council remediation (joint WS-A.B council, 2026-05-13):
 *   R-B-C1: NEVER silently default a missing quantity modifier to 1. Emit
 *           `multiplicity: null` + `verification_status: 'missing-quantity'`
 *           when the part is not a recognised singleton.
 *   R-B-C2: if a sub-module has empty words[], inject a deterministic stub
 *           (uncategorised character_id with solid_state_of_matter material
 *           radical) AND append a council_notes entry. Never silently drop
 *           the sub-module.
 *
 * Feature flag: `RADICAL_TIER4_TREE=true` selects this path. Default off —
 * legacy `buildTreeFromLeaves` continues to run untouched.
 */

import type { CompositionNode, RadicalTree } from './schema.js'
import { CURRENT_RADICAL_SPEC_VERSION } from './schema.js'
import {
  HIERARCHY_STATS,
} from './character-hierarchy.js'
import type { LeafRecord, BuildResult } from './structural-builder.js'
import type {
  ModuleDecomposition,
  ModuleSpec,
  SubModuleSpec,
  WordSpec,
} from '../types/module-decomposition.js'

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

/**
 * WS-B 2026-05-13: opt in to the Tier 4 tree builder.
 * When false (default), the legacy `buildTreeFromLeaves` runs unchanged.
 *
 * Interaction with `RADICAL_MULTI_EMITTER`: independent. The Tier 4 path
 * consumes whatever `moduleDecomposition.modules[].sub_modules[].words[]`
 * is on state — populated either by the legacy monolith or by the multi-
 * emitter ensemble. The flag is decoupled so we can A/B compare:
 *   MULTI_EMITTER=on,  TIER4_TREE=off → iter-07 baseline (multimodal 7.83)
 *   MULTI_EMITTER=on,  TIER4_TREE=on  → WS-B target (memo §6.2 + R-B-C1/C2)
 *   MULTI_EMITTER=off, TIER4_TREE=on  → single-emitter Tier 4 tree (smoke test)
 */
export function isTier4TreeEnabled(): boolean {
  const raw = (process.env.RADICAL_TIER4_TREE ?? '').toLowerCase().trim()
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on'
}

// ---------------------------------------------------------------------------
// Singleton heuristic
// ---------------------------------------------------------------------------

/**
 * A sub-module's words are CONTAINER-LIKE when their content character is
 * inherently a one-off — there is one chassis, one OEM enclosure, one
 * software stack. In those cases the absence of a `quantity` modifier is
 * NOT a defect (R-B-C1 carve-out): emit multiplicity=1 with no warning.
 *
 * Heuristic: pattern-match the SubModuleSpec.id, name_human, role_verb,
 * topology_clause, english_sentence, and the WordSpec content_character
 * character_id / name_human against a small set of singleton-suggestive
 * keywords drawn from the BESS / heat-pump / drone worked examples.
 *
 * KEEP THIS LIST CONSERVATIVE. The cost of a false-negative (legitimate
 * singleton flagged as missing-quantity) is a noisy QA report. The cost
 * of a false-positive (3,920-cell LFP string silently set to qty=1) is
 * iter-07-grade BoM regression. Bias toward flagging.
 */
const SINGLETON_KEYWORDS: readonly string[] = [
  // Chassis / enclosure
  'chassis',
  'enclosure',
  'shell',
  'container',
  'cabinet',
  'hull',
  'frame_assembly',
  // OEM single-unit subsystems
  'inverter_unit',
  'pcs_unit',
  'ems_unit',
  'scada',
  'bms_master',
  'main_controller',
  'plc_unit',
  'main_transformer',
  'main_compressor',
  // Software / firmware
  'firmware',
  'software_stack',
  'control_software',
  // Service / commissioning artefacts
  'commissioning_kit',
  'service_manual',
  'spare_kit',
]

function isSingletonWord(sm: SubModuleSpec, word: WordSpec): boolean {
  const haystack = [
    sm.id,
    sm.name_human,
    sm.role_verb ?? '',
    sm.topology_clause ?? '',
    sm.english_sentence ?? '',
    word.id,
    word.name_human,
    word.content_character?.character_id ?? '',
    word.content_character?.name_human ?? '',
  ]
    .join(' ')
    .toLowerCase()

  return SINGLETON_KEYWORDS.some(k => haystack.includes(k))
}

// ---------------------------------------------------------------------------
// Quantity parsing — mirrors stages/2-decompose.ts:1447
// ---------------------------------------------------------------------------

/**
 * Parse a quantity-modifier value (e.g. "×3920", "3920", "x112", "3,920")
 * into an integer ≥ 1. Returns null when the value is missing, hedged
 * ("approximately", "many"), or otherwise non-numeric.
 */
function parseQuantityModifier(value: string | undefined | null): number | null {
  if (value === undefined || value === null) return null
  const raw = String(value).trim()
  if (raw === '') return null
  const stripped = raw.replace(/^[×x]\s*/i, '').replace(/[\s,]/g, '')
  const parsed = parseInt(stripped, 10)
  if (Number.isFinite(parsed) && parsed >= 1) return parsed
  return null
}

// ---------------------------------------------------------------------------
// Leaf factory (memo §6.2 + §8.A.1)
// ---------------------------------------------------------------------------

/**
 * Walk one WordSpec and emit a single LeafRecord. Council R-B-C1 governs
 * the quantity handling: null multiplicity + verification_status when the
 * quantity modifier is absent AND the word is not a recognised singleton.
 */
function leafFromWord(
  module: ModuleSpec,
  subModule: SubModuleSpec,
  word: WordSpec,
): LeafRecord {
  const characterId = word.content_character?.character_id ?? '<UNKNOWN>'
  const nameHuman = word.content_character?.name_human ?? word.name_human ?? null

  const qtyMod = (word.modifier_characters ?? []).find(m => m.kind === 'quantity')
  const parsedQty = parseQuantityModifier(qtyMod?.value)

  let multiplicity: number | null
  let verificationStatus: LeafRecord['verification_status'] = null

  if (parsedQty !== null) {
    // Happy path: Tier 4 emitted a numeric quantity modifier.
    multiplicity = parsedQty
  } else if (isSingletonWord(subModule, word)) {
    // Recognised singleton (chassis, OEM unit, software stack) — qty=1 is
    // the correct answer; no warning needed.
    multiplicity = 1
  } else {
    // R-B-C1: do NOT silently default to 1. Surface the gap.
    multiplicity = null
    verificationStatus = 'missing-quantity'
  }

  return {
    character_id: characterId,
    archetype_id: null, // Resolution stays in 4b-radical-resolution
    multiplicity,
    mpn_hint: null,
    manufacturer_hint: null,
    estimated_unit_price_gbp: null,
    description: nameHuman,
    sub_module_id: subModule.id,
    word_id: word.id,
    verification_status: verificationStatus,
  }
}

/**
 * R-B-C2: produce a deterministic stub LeafRecord for a sub-module that
 * Tier 4 emitted with an empty `words[]` array. Mirrors the fallback shape
 * used by `stages/1.7-module-decomposition.ts:929-944` so downstream
 * consumers (4b-radical-resolution, §6 BoM renderer) treat it as a
 * recognised pure-material leaf without crashing.
 */
function stubLeafForEmptySubModule(
  module: ModuleSpec,
  subModule: SubModuleSpec,
): LeafRecord {
  return {
    character_id: 'uncategorised',
    archetype_id: null,
    multiplicity: 1,
    mpn_hint: null,
    manufacturer_hint: null,
    estimated_unit_price_gbp: null,
    description: `R-B-C2 stub for empty sub_module "${subModule.id}" in module "${module.module}"`,
    sub_module_id: subModule.id,
    word_id: `${subModule.id}_stub_word`,
    verification_status: 'stub',
  }
}

// ---------------------------------------------------------------------------
// Public entry: buildTreeFromModuleDecomposition
// ---------------------------------------------------------------------------

/**
 * Build a RadicalTree directly from a `ModuleDecomposition`. No hierarchy
 * lookup — `sentence_id` is the UniversalModule key, `word_id` is the
 * SubModuleSpec.id, and each WordSpec becomes one leaf.
 *
 * Side effect: appends R-B-C2 stub-injection notes onto
 * `moduleDecomposition.council_notes` so QA sees the gap. The caller
 * mutates the decomposition object in place; if pure-functional behaviour
 * is required, clone before invoking.
 *
 * @param moduleDecomposition Stage 1.7 LLM output (multi-emitter or legacy).
 * @param productSlug         Product slug for the tree id (e.g. "rs-bess").
 * @param productClass        Product class string (e.g. "battery_energy_storage").
 *                            Stored on the composition description; not used
 *                            for filtering (the whole point of WS-B).
 */
export function buildTreeFromModuleDecomposition(
  moduleDecomposition: ModuleDecomposition,
  productSlug: string,
  productClass: string,
): BuildResult {
  const leaves: LeafRecord[] = []
  const groupedSentences: CompositionNode[] = []
  let stubCount = 0
  let missingQtyCount = 0

  // Sort modules by canonical UniversalModule order is overkill here — keep
  // the order Stage 1.7 emitted (already deterministic).
  for (const moduleSpec of moduleDecomposition.modules ?? []) {
    const sentenceId = moduleSpec.module
    const subModules = moduleSpec.sub_modules ?? []
    const wordNodes: CompositionNode[] = []

    for (const subModule of subModules) {
      const words = subModule.words ?? []

      // R-B-C2: empty words[] → inject a stub. NEVER silently drop the sub-module.
      const effectiveWords: Array<{ word: WordSpec | null; isStub: boolean }> =
        words.length === 0
          ? [{ word: null, isStub: true }]
          : words.map(w => ({ word: w, isStub: false }))

      const wordLeaves: LeafRecord[] = []
      for (const entry of effectiveWords) {
        let leaf: LeafRecord
        if (entry.isStub) {
          leaf = stubLeafForEmptySubModule(moduleSpec, subModule)
          stubCount += 1
        } else {
          leaf = leafFromWord(moduleSpec, subModule, entry.word as WordSpec)
          if (leaf.verification_status === 'missing-quantity') {
            missingQtyCount += 1
          }
        }
        leaves.push(leaf)
        wordLeaves.push(leaf)
      }

      // Within-sub-module archetype dedup (mirrors structural-builder.ts:1157-1168
      // semantics — same logical part emitted twice within one sub-module
      // collapses to the MAX quantity, preserving the most aggressive count).
      const leafByCharacter = new Map<string, LeafRecord>()
      for (const wl of wordLeaves) {
        const existing = leafByCharacter.get(wl.character_id)
        if (!existing) {
          leafByCharacter.set(wl.character_id, wl)
          continue
        }
        const incoming = wl.multiplicity ?? 0
        const current = existing.multiplicity ?? 0
        if (incoming > current) {
          leafByCharacter.set(wl.character_id, wl)
        }
      }

      const leafNodes: CompositionNode[] = [...leafByCharacter.values()]
        .sort((a, b) => a.character_id.localeCompare(b.character_id))
        .map(leaf => ({
          archetypeId: leaf.character_id,
          // For renderer display: null multiplicity displays as qty=1. The
          // verification_status sidecar is what surfaces the gap.
          quantity: leaf.multiplicity ?? 1,
          children: [],
          sub_module_id: subModule.id,
          word_id: leaf.word_id ?? null,
          // WS-B R-B-C1 / R-B-C2: propagate the provenance flag so the §6
          // BoM renderer can show the ⚠ MISSING-QTY / ⚠ STUB glyph.
          verification_status: leaf.verification_status ?? null,
        }))

      wordNodes.push({
        archetypeId: subModule.id,
        quantity: 1,
        children: leafNodes,
      })
    }

    groupedSentences.push({
      archetypeId: sentenceId,
      quantity: 1,
      children: wordNodes.sort((a, b) => a.archetypeId.localeCompare(b.archetypeId)),
    })
  }

  // R-B-C2: surface stub injections to council_notes so QA sees the gap.
  // Mutates the decomposition in place — the caller must accept this trade.
  if (stubCount > 0) {
    const note =
      `[WS-B/R-B-C2] buildTreeFromModuleDecomposition injected ${stubCount} stub ` +
      `leaf${stubCount === 1 ? '' : 's'} for sub-module${stubCount === 1 ? '' : 's'} with empty words[]. ` +
      `Verify Stage 1.7 emission completeness.`
    moduleDecomposition.council_notes = moduleDecomposition.council_notes ?? []
    moduleDecomposition.council_notes.push(note)
  }
  if (missingQtyCount > 0) {
    const note =
      `[WS-B/R-B-C1] buildTreeFromModuleDecomposition flagged ${missingQtyCount} leaf${missingQtyCount === 1 ? '' : 's'} ` +
      `with missing quantity modifier (non-singleton parts only). BoM renderer should show MISSING-QTY glyph.`
    moduleDecomposition.council_notes = moduleDecomposition.council_notes ?? []
    moduleDecomposition.council_notes.push(note)
  }

  const rootArchetypeId = `${productSlug.replace(/[^a-z0-9_]/gi, '_').toLowerCase()}_system`
  const root: CompositionNode = {
    archetypeId: rootArchetypeId,
    quantity: 1,
    children: groupedSentences.sort((a, b) => a.archetypeId.localeCompare(b.archetypeId)),
  }

  const tree: RadicalTree = {
    radical_spec_version: CURRENT_RADICAL_SPEC_VERSION,
    composition: {
      id: productSlug,
      description: `${productClass} system — WS-B Tier 4 tree (decoupled from WORDS[] cap)`,
      environment: ['industrial'],
      root,
    },
    meta: {
      created_at: new Date().toISOString(),
      product_slug: productSlug,
      authored_by: 'ws-b-tier4-tree-builder',
    },
  }

  const placedLeafCount = leaves.length
  const sentencesCount = groupedSentences.length
  const wordsCount = groupedSentences.reduce((n, s) => n + (s.children?.length ?? 0), 0)

  console.log(
    `[ws-b/tier4-tree] Built tree from ModuleDecomposition: ` +
    `${sentencesCount} modules, ${wordsCount} sub-modules, ${placedLeafCount} leaves ` +
    `(${stubCount} stubs, ${missingQtyCount} missing-qty flags). ` +
    `BoM cap inversion: no WORDS[] filter.`,
  )

  return {
    tree,
    unmappedCharacters: [], // WS-B does not filter; everything Tier 4 emits is placed.
    placedLeafCount,
    stats: {
      sentences: sentencesCount,
      words: wordsCount,
      leaves: placedLeafCount,
      unmapped: 0,
      hierarchyStats: HIERARCHY_STATS,
    },
  }
}

/**
 * Flat leaf list extracted from a ModuleDecomposition — exported as a
 * convenience for callers that want only the leaves (e.g. cost-rollup
 * smoke tests). Internally re-uses `buildTreeFromModuleDecomposition`'s
 * leaf factory rules so behaviour stays consistent.
 *
 * NOTE: does NOT mutate `moduleDecomposition.council_notes`. For the
 * production path use `buildTreeFromModuleDecomposition` directly.
 */
export function leafRecordsFromModuleDecomposition(
  moduleDecomposition: ModuleDecomposition,
): LeafRecord[] {
  const leaves: LeafRecord[] = []
  for (const moduleSpec of moduleDecomposition.modules ?? []) {
    for (const subModule of moduleSpec.sub_modules ?? []) {
      const words = subModule.words ?? []
      if (words.length === 0) {
        leaves.push(stubLeafForEmptySubModule(moduleSpec, subModule))
        continue
      }
      for (const w of words) {
        leaves.push(leafFromWord(moduleSpec, subModule, w))
      }
    }
  }
  return leaves
}
