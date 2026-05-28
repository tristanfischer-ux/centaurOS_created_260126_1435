/**
 * scripts/lib/jurisdiction-prose-filter.ts
 *
 * Post-Phase-2 jurisdiction prose filter.
 *
 * Substitutes US/foreign-jurisdiction standards citations in the live design
 * object (moduleDecomposition + naturalLanguageLayer) with the corresponding
 * UK/IEC/BS equivalent BEFORE the gate-19 jurisdictional-standards-audit runs.
 *
 * Sources the filter catches (per L29 gate-19 audit — 33 HIGH findings):
 *   - modifier_characters[kind=regulatory] values added by Phase 2 LLM repair
 *   - english_sentence / rad_syntax prose strings
 *   - naturalLanguageLayer paragraph_en / sub_module_sentences / grammar_trace
 *
 * The same UK_CODE_SUBSTITUTIONS map used here must stay in sync with the
 * deterministic-emitter's inline substitutions (Part 1 of the L29 fix).
 * If a new code appears in a future gate-19 audit, ADD IT HERE and to the
 * emitter's inline strings.
 *
 * Wired into serial-design-chain-v2.tsx AFTER buildNaturalLanguageLayer()
 * and BEFORE state assembly (gate 19 reads from state.json).
 *
 * Can also be run as a standalone CLI for post-hoc filtering:
 *   npx tsx scripts/lib/jurisdiction-prose-filter.ts <in.json> <out.json>
 */

// ---------------------------------------------------------------------------
// Substitution table — US/foreign → UK/IEC equivalent
// Ordering: longest match first so "UL 60947-4-1" doesn't partially match
// the "UL 60947-4" entry before we reach the longer one.
// ---------------------------------------------------------------------------
export const UK_CODE_SUBSTITUTIONS: Array<[RegExp, string]> = [
  // Motor controllers / contactors
  [/\bUL 60947-4-1\b/g, 'IEC 60947-4-1'],
  [/\bUL 60947-4\b/g, 'IEC 60947-4-1'],
  // MCCBs
  [/\bUL 489\b/g, 'IEC 60947-2'],
  // Grounding / bonding
  [/\bUL 467\b/g, 'BS 7430'],
  // Cell / stationary-battery
  [/\bUL 1973\b/g, 'IEC 62619'],
  // Pad-mount / external transformer
  [/\bUL 706\b/g, 'IEC 62933-5-2 §6.4'],
  // Current transformers
  [/\bUL 1577\b/g, 'IEC 60044-1'],
  // PCS / inverter safety (silicone wire insulation, power electronics)
  [/\bUL 3266\b/g, 'IEC 62477-1'],
  // ECARO-25 (FE-25 / HFC-125 hardware) — incompatible with Novec 1230.
  // L31 recurring hallucination: Phase 2 repair LLM repeatedly re-introduces
  // ECARO-25 for Novec 1230 suppression systems. The correct hardware for
  // Novec 1230 is Kidde ECS. Substitute so the gate-19 filter removes it
  // even if the LLM guardrail fails to prevent emission.
  [/\bECARO-25\b/gi, 'Kidde ECS'],
  // Clean agent extinguishers / suppression nozzles
  [/\bUL 2166\b/g, 'BS EN 12094'],
  // Thermal detectors / heat detectors
  [/\bUL 521\b/g, 'BS EN 54-5'],
  // Gas detectors (combustible / CO)
  [/\bUL 2075\b/g, 'BS EN 50194-1'],
  // Fuses
  [/\bUL 248\b/g, 'IEC 60269'],
  // Cable management / cable ties (L51 gate-19 HIGH 2026-05-28): the Phase 2
  // LLM emitted "UL 62275" on the cable_tie_word regulatory modifier; it
  // propagated to 5 prose surfaces. 62275 is an IEC-harmonised number, so the
  // UK/EU equivalent is the identical number under the EN prefix.
  [/\bUL 62275\b/g, 'EN 62275'],
  // Cable trunking / trays + conduit (same IEC-harmonised family, dual-published)
  [/\bUL 61537\b/g, 'EN 61537'],
  [/\bUL 651\b/g, 'IEC 61386'],
  // Enclosure ingress protection (NEMA → IP equivalent family)
  [/\bUL 50E\b/g, 'IEC 60529'],
  // Stainless steel pipe / tube
  [/\bASTM A312\b/g, 'BS EN 10216-5'],
  // Digital isolators (UL 1577 is the primary but cover the broader form too)
  // Already covered above by UL 1577 → IEC 60044-1
  // NEC citations
  [/\bNEC 706\.10\b/g, 'IEC 62933-5-2 §6.4'],
  [/\bNEC\b/g, 'IEC'],
]

// ---------------------------------------------------------------------------
// Core string-substitution function
// ---------------------------------------------------------------------------
export function substituteJurisdictionCodes(text: string): string {
  let result = text
  for (const [pattern, replacement] of UK_CODE_SUBSTITUTIONS) {
    result = result.replace(pattern, replacement)
  }
  return result
}

// ---------------------------------------------------------------------------
// Walk the full design object and substitute in-place
// ---------------------------------------------------------------------------

interface ModifierCharacter {
  kind: string
  value: string
  [key: string]: unknown
}

interface WordSpec {
  modifier_characters?: ModifierCharacter[]
  [key: string]: unknown
}

interface SubModuleSpec {
  english_sentence?: string
  rad_syntax?: string
  topology_clause?: string
  paragraph_en?: string
  sentence_en?: string
  words?: WordSpec[]
  [key: string]: unknown
}

interface ModuleSpec {
  module_brief?: string
  overview_paragraph_en?: string
  sub_modules?: SubModuleSpec[]
  [key: string]: unknown
}

interface NlSubModuleSentence {
  sentence_en?: string
  sentence_rad?: string
  paragraph_en?: string
  [key: string]: unknown
}

interface NlModuleEntry {
  paragraph_en?: string
  paragraph_rad?: string
  grammar_trace?: string
  sub_module_sentences?: NlSubModuleSentence[]
  [key: string]: unknown
}

interface NaturalLanguageLayer {
  by_module?: Record<string, NlModuleEntry>
  [key: string]: unknown
}

interface BriefOverviewProse {
  [key: string]: unknown
}

/**
 * Apply jurisdiction substitution to all audit-target surfaces in a design
 * module array. Mutates in-place; returns the same array for convenience.
 */
export function applyJurisdictionFilterToModules(modules: ModuleSpec[]): ModuleSpec[] {
  for (const mod of modules) {
    if (mod.module_brief) mod.module_brief = substituteJurisdictionCodes(mod.module_brief)
    if (mod.overview_paragraph_en) mod.overview_paragraph_en = substituteJurisdictionCodes(mod.overview_paragraph_en)
    for (const sub of mod.sub_modules ?? []) {
      if (sub.english_sentence) sub.english_sentence = substituteJurisdictionCodes(sub.english_sentence)
      if (sub.rad_syntax) sub.rad_syntax = substituteJurisdictionCodes(sub.rad_syntax)
      if (sub.topology_clause) sub.topology_clause = substituteJurisdictionCodes(sub.topology_clause)
      if (sub.paragraph_en) sub.paragraph_en = substituteJurisdictionCodes(sub.paragraph_en)
      if (sub.sentence_en) sub.sentence_en = substituteJurisdictionCodes(sub.sentence_en)
      for (const w of sub.words ?? []) {
        for (const mc of w.modifier_characters ?? []) {
          if (mc.kind === 'regulatory' && mc.value) {
            mc.value = substituteJurisdictionCodes(mc.value)
          }
        }
      }
    }
  }
  return modules
}

/**
 * Apply jurisdiction substitution to all audit-target surfaces in a
 * naturalLanguageLayer. Mutates in-place.
 */
export function applyJurisdictionFilterToNlLayer(nl: NaturalLanguageLayer): NaturalLanguageLayer {
  const byModule = nl.by_module ?? {}
  for (const entry of Object.values(byModule)) {
    if (entry.paragraph_en) entry.paragraph_en = substituteJurisdictionCodes(entry.paragraph_en)
    if (entry.paragraph_rad) entry.paragraph_rad = substituteJurisdictionCodes(entry.paragraph_rad)
    if (entry.grammar_trace) entry.grammar_trace = substituteJurisdictionCodes(entry.grammar_trace)
    for (const sm of entry.sub_module_sentences ?? []) {
      if (sm.sentence_en) sm.sentence_en = substituteJurisdictionCodes(sm.sentence_en)
      if (sm.sentence_rad) sm.sentence_rad = substituteJurisdictionCodes(sm.sentence_rad)
      if (sm.paragraph_en) sm.paragraph_en = substituteJurisdictionCodes(sm.paragraph_en)
    }
  }
  return nl
}

/**
 * Apply jurisdiction substitution to briefOverviewProse (all string values).
 */
export function applyJurisdictionFilterToBriefProse(
  prose: BriefOverviewProse | null | undefined,
): BriefOverviewProse | null | undefined {
  if (!prose) return prose
  for (const key of Object.keys(prose)) {
    const v = (prose as Record<string, unknown>)[key]
    if (typeof v === 'string') {
      ;(prose as Record<string, unknown>)[key] = substituteJurisdictionCodes(v)
    }
  }
  return prose
}

// ---------------------------------------------------------------------------
// Standalone CLI entry point
// ---------------------------------------------------------------------------
async function main() {
  const [, , inPath, outPath] = process.argv
  if (!inPath || !outPath) {
    console.error('Usage: npx tsx jurisdiction-prose-filter.ts <in.json> <out.json>')
    process.exit(1)
  }
  const { readFileSync, writeFileSync } = await import('fs')
  const state = JSON.parse(readFileSync(inPath, 'utf8'))
  if (state.moduleDecomposition?.modules) {
    applyJurisdictionFilterToModules(state.moduleDecomposition.modules)
  }
  if (state.naturalLanguageLayer) {
    applyJurisdictionFilterToNlLayer(state.naturalLanguageLayer)
  }
  if (state.briefOverviewProse) {
    applyJurisdictionFilterToBriefProse(state.briefOverviewProse)
  }
  writeFileSync(outPath, JSON.stringify(state, null, 2), 'utf8')
  console.log(`jurisdiction-prose-filter: wrote ${outPath}`)
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1) })
}
