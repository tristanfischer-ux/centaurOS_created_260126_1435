/**
 * scripts/lib/orchestrator/brief-scope-filter.ts
 *
 * U6 — UNIVERSAL brief-scope module gating.
 *
 * Emitters emit their full canonical module set. This universal post-emit pass
 * (wired into assembler.ts `finalise`, so it runs for EVERY class) drops
 * modules that are OPTIONAL for the class AND not signalled by the brief —
 * moving them to design.excluded_modules with a rationale and pruning any
 * cross_module_grammar_links that reference them.
 *
 * Why: the interpreted brief is the contract; engines must not add subsystems
 * the brief neither requests nor implies. VF surfaced this — the emitter
 * force-added a `harvest_handling` module (304 stainless bench + OIML scale +
 * BRCGS wash station, ~£3k) that the brief never mentioned and that the owner
 * does as a separate system. Part of the brief-transmission spine (U5): every
 * emitted module must trace to a brief signal.
 *
 * Conservative by construction: a module is dropped ONLY if it is explicitly
 * listed OPTIONAL for the class AND no signal keyword appears anywhere in the
 * brief. Modules not in the registry are treated as REQUIRED (never dropped).
 * A keyword coincidence keeps the module (safe direction); the only risk is
 * keeping an unneeded module, never silently dropping a needed one.
 *
 * To gate a force-added module for a class: add an entry to OPTIONAL_MODULES.
 */

import type { DesignJSON } from './assembler'
import type { ParsedConstraints, BriefEnvelope } from './types'

interface OptionalModuleSpec {
  /** Lowercase keywords; if ANY appears anywhere in the brief, the module is kept. */
  signals: string[]
  /** Human reason recorded in rationale_excluded when the module is dropped. */
  reason: string
}

/**
 * Per-class optional modules + the brief signals that justify keeping them.
 * Keyed by envelope.class slug. Extend as classes surface force-added modules
 * that aren't always in scope.
 */
export const OPTIONAL_MODULES: Record<string, Record<string, OptionalModuleSpec>> = {
  vertical_farm: {
    harvest_handling: {
      signals: ['harvest', 'packing', 'pack house', 'packhouse', 'sorting', 'grading', 'weighing', 'punnet', 'post-harvest'],
      reason: 'no harvest/packing requirement in the brief — harvesting is a separate system',
    },
  },
}

interface GrammarLink {
  from_module?: string
  to_module?: string
  [k: string]: unknown
}

/** One lowercase haystack from the structured brief for signal matching. */
function briefHaystack(brief: ParsedConstraints): string {
  try {
    return JSON.stringify(brief ?? {}).toLowerCase()
  } catch {
    return ''
  }
}

/**
 * Drop OPTIONAL modules the brief does not signal. Universal across all classes
 * via the assembler's finalise() pass.
 */
export function applyBriefScopeFilter(
  design: DesignJSON,
  brief: ParsedConstraints,
  envelope: BriefEnvelope,
): DesignJSON {
  const optionalForClass = OPTIONAL_MODULES[envelope?.class ?? '']
  if (!optionalForClass) return design // no optional modules declared for this class

  const haystack = briefHaystack(brief)
  const dropped: string[] = []
  const droppedReasons: string[] = []

  const keptModules = design.modules.filter((m) => {
    const spec = optionalForClass[m.module]
    if (!spec) return true // not optional => required => keep
    const signalled = spec.signals.some((kw) => haystack.includes(kw.toLowerCase()))
    if (signalled) return true // brief asks for it => keep
    dropped.push(m.module)
    droppedReasons.push(`${m.module} (${spec.reason})`)
    return false
  })

  if (dropped.length === 0) return design

  // Prune cross-module grammar links that reference a dropped module (dual-write
  // completeness: drop the module AND its dangling references).
  const keptLinks = (design.cross_module_grammar_links as GrammarLink[]).filter(
    (l) => !dropped.includes(l?.from_module ?? '') && !dropped.includes(l?.to_module ?? ''),
  )

  const note = `Brief-scope filter (U6) excluded ${dropped.length} module(s) not signalled by the brief: ${droppedReasons.join('; ')}.`

  return {
    ...design,
    modules: keptModules,
    cross_module_grammar_links: keptLinks,
    excluded_modules: [...(design.excluded_modules ?? []), ...dropped],
    rationale_excluded: design.rationale_excluded ? `${design.rationale_excluded} ${note}` : note,
  }
}
