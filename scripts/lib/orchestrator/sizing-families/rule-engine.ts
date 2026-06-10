/**
 * scripts/lib/orchestrator/sizing-families/rule-engine.ts
 *
 * Shared deterministic word-scan for sizing-family plugins (E2).
 *
 * `scanWordsAgainstRules` replicates the LEGACY applyFamilySizing loop
 * (generic/sizing.ts) EXACTLY — same haystack construction, same first-match-
 * wins, same skip-on-empty — but instead of mutating the word it emits
 * ModifierWrite records (pure). The byte-identity of the BATTERY port rests
 * on this loop + `mergeMods` being shared with the legacy implementation.
 *
 * British spelling throughout.
 */

import type { SizingParams, SizingRule } from '../generic/sizing'
import type { ModifierWrite, SizableModule } from './types'

export interface FamilyRule extends SizingRule {
  /** Engineering basis (correlation / standard / first-principles formula).
   *  Mandatory for the NEW families; the legacy BATTERY rules get a generic
   *  basis tag at the plugin boundary. */
  basis?: string
}

/**
 * Pure scan: for every word, the FIRST rule whose regex matches the haystack
 * fires; an empty modifier list (missing source quantity — the never-invent
 * discipline) emits nothing.
 */
export function scanWordsAgainstRules(
  modules: ReadonlyArray<SizableModule>,
  rules: ReadonlyArray<FamilyRule>,
  params: SizingParams,
  provenance: string,
  defaultBasis: string,
): ModifierWrite[] {
  const writes: ModifierWrite[] = []
  const mods = modules ?? []
  for (let mi = 0; mi < mods.length; mi++) {
    const subs = mods[mi]?.sub_modules ?? []
    for (let si = 0; si < subs.length; si++) {
      const words = subs[si]?.words ?? []
      for (let wi = 0; wi < words.length; wi++) {
        const w = words[wi]
        // Identical haystack to legacy applyFamilySizing (byte-identity anchor).
        const hay = `${w.id ?? ''} ${w.name_human ?? ''} ${w.content_character?.character_id ?? ''} ${w.content_character?.name_human ?? ''}`.toLowerCase()
        const rule = rules.find((r) => r.match.test(hay))
        if (!rule) continue
        const add = rule.size(params)
        if (add.length === 0) continue
        writes.push({
          path: { module: mi, sub_module: si, word: wi },
          word_id: w.id,
          rule_id: rule.id,
          basis: rule.basis ?? defaultBasis,
          modifiers: add,
          provenance,
        })
      }
    }
  }
  return writes
}
