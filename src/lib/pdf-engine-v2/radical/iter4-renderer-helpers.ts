/**
 * @file iter4-renderer-helpers.ts — natural-language layer renderer helpers.
 *
 * Iter 4 — Phase B-staging. Pure helpers consumed by the PDF renderer
 * (`stages/7b-pdf-v3-radical-document.tsx`) once V10 dual-run completes
 * and the renderer is wired up to consume `state.moduleDecomposition`.
 *
 * Splitting these helpers into their own module keeps the renderer file
 * lean, makes the natural-language wiring trivially testable in isolation
 * (the renderer file's React-PDF dependencies make unit tests painful),
 * and isolates the V10-sensitive renderer file from Phase B scope.
 *
 * Memory drawer: forgeos_decisions_393756e2f253f189.
 */

import type {
  ModifyingCharacter,
  ModuleDecomposition,
  ModuleSpec,
  SubModuleSpec,
} from '../types/module-decomposition'
import {
  generateGrammarTrace,
  generateModuleParagraph,
  generateModuleSentence,
  generateSubmoduleSentence,
  humaniseId,
  modifierStripInline,
} from './sentence-generator'

// ---------------------------------------------------------------------------
// State accessor — reads moduleDecomposition off PipelineState
// ---------------------------------------------------------------------------

/**
 * Extract `state.moduleDecomposition` from a PipelineState in a type-safe way.
 *
 * Why a helper: the field is currently stored via `(state as any).moduleDecomposition`
 * in `index.ts` — there's no typed PipelineState slot for it yet. Centralising
 * the cast keeps the renderer free of `as any` and gives a single point to add
 * the typed slot later (touch this helper, not every call site).
 */
export function getModuleDecomposition(
  state: unknown,
): ModuleDecomposition | undefined {
  if (!state || typeof state !== 'object') return undefined
  const md = (state as { moduleDecomposition?: unknown }).moduleDecomposition
  if (!md || typeof md !== 'object') return undefined
  return md as ModuleDecomposition
}

// ---------------------------------------------------------------------------
// Sub-module lookups
// ---------------------------------------------------------------------------

/**
 * Build an archetype-id → SubModuleSpec lookup map across all modules in
 * a decomposition.
 *
 * Two indexing keys are populated per sub-module:
 *   - SubModuleSpec.id                  (eg "cell_string")
 *   - SubModuleSpec.primary_character_id (eg "lfp_prismatic_cell")
 *
 * The renderer matches resolved-tree leaves by their `archetypeId`, which
 * usually corresponds to the primary character ID. Falling back to
 * SubModuleSpec.id covers cases where a sub-module's id mirrors the
 * leaf's archetypeId (eg word-level groups).
 *
 * Returns an empty map when the decomposition has no sub-modules — keeps
 * the call site free of null checks.
 */
export function buildSubModuleLookup(
  decomposition: ModuleDecomposition | undefined,
): Map<string, SubModuleSpec> {
  const lookup = new Map<string, SubModuleSpec>()
  if (!decomposition) return lookup
  for (const mod of decomposition.modules) {
    for (const sub of mod.sub_modules ?? []) {
      // Prefer the first writer wins — explicit IDs are higher confidence
      // than primary-character-id back-references.
      if (!lookup.has(sub.id)) lookup.set(sub.id, sub)
      if (!lookup.has(sub.primary_character_id)) {
        lookup.set(sub.primary_character_id, sub)
      }
    }
  }
  return lookup
}

/**
 * Find the SubModuleSpec for a resolved-tree leaf by archetype ID.
 *
 * Matching priority (first hit wins):
 *   1. exact match on SubModuleSpec.id
 *   2. exact match on SubModuleSpec.primary_character_id
 *   3. undefined (no match — caller renders the legacy "—" fallback)
 *
 * The lookup map should be built ONCE per render and passed in (rebuilding
 * for every leaf is O(n*m) — not free for a 200-leaf BoM).
 */
export function findSubModuleForLeaf(
  archetypeId: string,
  lookup: Map<string, SubModuleSpec>,
): SubModuleSpec | undefined {
  return lookup.get(archetypeId)
}

// ---------------------------------------------------------------------------
// Inline modifier strip for the BoM "Modifiers" column (Change 4)
// ---------------------------------------------------------------------------

/**
 * Render the parenthesised inline-compressed modifier strip for a single
 * BoM row, given the leaf's archetype ID and the global sub-module lookup.
 *
 *   Returns:
 *     - the strip text (without surrounding parentheses) when a matching
 *       sub-module is found AND it has at least one modifier
 *     - empty string when no match or no modifiers — caller renders "—"
 *
 * Caller wraps in parentheses inside the table cell:
 *
 *     const modText = renderInlineModifiersForLeaf(leaf.archetypeId, lookup)
 *     <Text>{modText ? `(${modText})` : '—'}</Text>
 *
 * Why no parentheses inside this helper: keeps the helper's output usable
 * for non-PDF surfaces (HTML preview, council reports, etc) where the
 * wrapping convention may differ.
 */
export function renderInlineModifiersForLeaf(
  archetypeId: string,
  lookup: Map<string, SubModuleSpec>,
): string {
  const sub = findSubModuleForLeaf(archetypeId, lookup)
  if (!sub) return ''
  if (!sub.modifiers || sub.modifiers.length === 0) return ''
  return modifierStripInline(sub.modifiers)
}

/**
 * Same as `renderInlineModifiersForLeaf` but takes a pre-resolved
 * SubModuleSpec — useful when the caller already has the sub-module from
 * a different lookup path.
 */
export function renderInlineModifiers(
  modifiers: ReadonlyArray<ModifyingCharacter>,
): string {
  return modifierStripInline(modifiers)
}

// ---------------------------------------------------------------------------
// Module-paragraph rendering data (Change 5)
// ---------------------------------------------------------------------------

/**
 * Per-module paragraph-rendering payload — what the renderer needs to
 * draw one Design Modules paragraph entry.
 *
 *   - heading        — humanised module name (eg "Energy storage source")
 *   - summary        — single-sentence module summary
 *   - subSentences   — pre-rendered sentences, one per sub-module
 *   - paragraph      — flowing-prose composition (summary + sub-sentences + link prose)
 *   - grammarTrace   — symbolic engineering-grammar trace (for the optional
 *                       monospace debug strip)
 *   - hasNlLayer     — true when sub_modules data is present; false when the
 *                       module has nothing but the legacy module_brief
 */
export interface ModuleParagraphData {
  moduleId: string
  heading: string
  summary: string
  subSentences: string[]
  paragraph: string
  grammarTrace: string
  hasNlLayer: boolean
}

/**
 * Build the paragraph-rendering payload for every module in a decomposition.
 *
 * Returns an empty array when the decomposition is missing or has no
 * applicable modules. The renderer should treat an empty return as
 * "Design Modules section pending — show legacy fallback" (NEVER rendering
 * a stub section silently — see banned-pattern memory drawer
 * `forgeos_gotchas_73b0a9291c9acebf` rule 1).
 */
export function buildModuleParagraphs(
  decomposition: ModuleDecomposition | undefined,
): ModuleParagraphData[] {
  if (!decomposition) return []
  const out: ModuleParagraphData[] = []
  for (const mod of decomposition.modules) {
    const subs = mod.sub_modules ?? []
    const subSentences = subs.map(s => generateSubmoduleSentence(s))
    out.push({
      moduleId: mod.module,
      heading: humaniseId(mod.module),
      summary: generateModuleSentence(mod),
      subSentences,
      paragraph: generateModuleParagraph(mod, subSentences),
      grammarTrace: generateGrammarTrace(mod),
      hasNlLayer: subs.length > 0,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Activation gate
// ---------------------------------------------------------------------------

/**
 * Whether the natural-language layer has any data to render across the
 * whole decomposition. Cheap O(modules) check — call this before swapping
 * the legacy Design Modules section for the paragraph variant; if false,
 * the renderer should keep the legacy tree view.
 */
export function hasNaturalLanguageLayer(
  decomposition: ModuleDecomposition | undefined,
): boolean {
  if (!decomposition) return false
  for (const mod of decomposition.modules) {
    if ((mod.sub_modules ?? []).length > 0) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Re-exports — single import point for the renderer
// ---------------------------------------------------------------------------

export type {
  ModifyingCharacter,
  ModuleDecomposition,
  ModuleSpec,
  SubModuleSpec,
}

export {
  generateGrammarTrace,
  generateModuleParagraph,
  generateModuleSentence,
  generateSubmoduleSentence,
  humaniseId,
  modifierStripInline,
}
