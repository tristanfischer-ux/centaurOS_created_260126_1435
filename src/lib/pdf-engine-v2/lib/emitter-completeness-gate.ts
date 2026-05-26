/**
 * @file lib/emitter-completeness-gate.ts — Emitter Completeness Gate (exit code 23)
 *
 * ARCHITECTURAL INVARIANT (2026-05-26, per Tristan directive "all fixes should
 * be permanent and architectural and universal"):
 *
 *   The deterministic-emitter OWNS every MPN-bearing word in every sub_module
 *   of every class. The Phase 2 LLM may ONLY modify existing words' modifiers
 *   and add prose-only words. It may NEVER add a new word_id with a
 *   part_number modifier.
 *
 * This gate enforces the contract at the entry point of Phase 2: if ANY
 * sub_module has zero deterministic-emitter words that carry a part_number
 * modifier, the chain fails with exit code 23. The emitter must be extended
 * to cover that sub_module before Phase 2 can run.
 *
 * WHY EXIT CODE 23 (not a soft warning):
 *   Without this gate, Phase 2 LLM fills the gap by proposing MPNs. Those
 *   MPNs are real-but-uncurated and the B1 allowlist rejects them every iter.
 *   The result is iter-N stall (no state change), wasting £0.30-0.80 per
 *   stalled chain. Gate 23 prevents the stall by detecting the gap before
 *   Phase 2 starts, forcing the emitter to be fixed first.
 *
 *   Empirical evidence: L37 BESS stalled at iter 13 on
 *   safety_protection::arc_flash_protection and hmi_ergonomics::hmi_panel
 *   for exactly this reason. Gate 23 codifies the root-cause fix universally.
 *
 * COVERAGE: universal — applies to ALL product classes, ALL sub_modules,
 *   regardless of whether the sub_module was emitted by the deterministic
 *   emitter or injected by a Phase 1 reviewer. If a Phase 1 reviewer adds a
 *   sub_module without MPN-bearing words, this gate correctly fails the chain
 *   (the fix is to add those words to the emitter or to remove the sub_module
 *   from the reviewer's scope).
 *
 * EXIT CODE 23 registered in CLAUDE.md chain exit codes table.
 *
 * Drawer: decisions room, added 2026-05-26:
 *   "DETERMINISTIC-EMITTER OWNS ALL MPN-BEARING SUB_MODULE WORDS; PHASE 2
 *    LLM IS PROSE-REFINER ONLY"
 *
 * Pre-change mempalace search: "deterministic-emitter completeness Phase 2 LLM
 *   invent MPN allowlist reject" → 5 drawers loaded including
 *   forgeos_decisions_217ed967a13de514 (engineering-first contract completeness).
 */

// ── Types (minimal — avoid circular import with ModuleSpec) ──────────────────

interface WordLike {
  id?: string
  modifier_characters?: Array<{ kind?: string; value?: string }>
}

interface SubModuleLike {
  id?: string
  words?: WordLike[]
}

interface DesignModuleLike {
  module?: string
  sub_modules?: SubModuleLike[]
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface IncompleteSubModule {
  module_id: string
  sub_module_id: string
  word_count: number
  mpn_word_count: number
}

export interface EmitterCompletenessGateResult {
  passed: boolean
  /** Sub-modules with zero emitter MPN-bearing words. Empty = PASS. */
  incomplete_sub_modules: IncompleteSubModule[]
  /** Total sub-modules checked. */
  total_sub_modules_checked: number
  /** Total sub-modules that have ≥1 MPN-bearing word. */
  passing_sub_modules: number
  /** Error message suitable for process.exit(23) + console.error. */
  error_message: string | null
  /** Class name extracted from the design for the error message. */
  class_name: string
}

/**
 * Run the emitter completeness gate against the design's module tree.
 *
 * A sub_module PASSES if it has ≥1 word whose modifier_characters contains
 * at least one entry with kind='part_number' (case-insensitive, normalised).
 *
 * A sub_module with zero words is treated as HAVING zero MPN words (it still
 * fails the gate — an empty sub_module is not a valid state either).
 *
 * @param modules      The design.modules array from state.moduleDecomposition
 * @param className    Product class string for the error message (e.g. 'bess')
 */
export function runEmitterCompletenessGate(
  modules: DesignModuleLike[],
  className: string,
): EmitterCompletenessGateResult {
  const incompleteSubModules: IncompleteSubModule[] = []
  let totalChecked = 0
  let passing = 0

  const safeMods = Array.isArray(modules) ? modules : []

  for (const m of safeMods) {
    const moduleId = String(m?.module ?? 'unknown_module')
    const subs = Array.isArray(m?.sub_modules) ? m.sub_modules : []

    for (const sm of subs) {
      const subModuleId = String(sm?.id ?? 'unknown_sub_module')
      totalChecked++

      const words = Array.isArray(sm?.words) ? sm.words : []
      const mpnWordCount = words.filter((w) => {
        const mods = Array.isArray(w?.modifier_characters) ? w.modifier_characters : []
        return mods.some((mc) => {
          const kind = String(mc?.kind ?? '').toLowerCase().replace(/[\s_-]/g, '')
          return kind === 'partnumber' || kind === 'part_number' || kind === 'pn'
        })
      }).length

      if (mpnWordCount === 0) {
        incompleteSubModules.push({
          module_id: moduleId,
          sub_module_id: subModuleId,
          word_count: words.length,
          mpn_word_count: 0,
        })
      } else {
        passing++
      }
    }
  }

  const passed = incompleteSubModules.length === 0

  let errorMessage: string | null = null
  if (!passed) {
    const N = incompleteSubModules.length
    const listLines = incompleteSubModules
      .map((s) => `  • ${s.module_id}::${s.sub_module_id} (${s.word_count} words, 0 with part_number)`)
      .join('\n')
    errorMessage =
      `[gate-23] ${N} sub_module${N === 1 ? '' : 's'} have no deterministic-emitter ` +
      `MPN-bearing words — emitter is incomplete for class "${className}". ` +
      `Phase 2 LLM is no longer permitted to invent MPNs; the class's ` +
      `deterministic-emitter must be extended to cover these sub_modules.\n` +
      `Add words with part_number modifiers for:\n${listLines}\n` +
      `\nExit code: 23. Fix: extend scripts/lib/deterministic-emitter.ts ` +
      `for the listed sub_modules, then re-run the chain.`
  }

  return {
    passed,
    incomplete_sub_modules: incompleteSubModules,
    total_sub_modules_checked: totalChecked,
    passing_sub_modules: passing,
    error_message: errorMessage,
    class_name: className,
  }
}
