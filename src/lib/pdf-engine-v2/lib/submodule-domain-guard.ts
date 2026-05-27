/**
 * @file lib/submodule-domain-guard.ts — Sub-Module Domain Guard (exit code 29)
 *
 * ARCHITECTURAL INVARIANT (2026-05-27, L46 council 3 of 4 seats — universal class-killer):
 *
 *   When a sub_module's id signals a domain (e.g. AC switchgear, DC power cabling),
 *   every word pinned inside it MUST carry a content_character.character_id whose
 *   prefix matches the parent sub_module's domain. The L46 council found
 *   `dc_power_cable_word` (character_id `dc_power_cable`) and
 *   `dc_power_cable_insulation_word` rendered INSIDE the AC switchgear sub_module
 *   `power_distribution::ac_switchgear`. Three of four reviewer seats independently
 *   flagged this as "incoherent" — the AC switchgear visually isolates 6
 *   components, two of which are DC cables that physically belong upstream in
 *   the DC distribution / DC power cabling sub_modules.
 *
 *   Council quote (L46):
 *   > "The AC switchgear isolates 6 components. ... 15× Prysmian DC power cable
 *   >  (part Afumex 1000V). 30× Prysmian DC power cable insulation (part
 *   >  Afumex-INSUL)."
 *
 * Root cause (upstream of this gate):
 *   The slot misassignment originates in the sub-module composition step
 *   (Step 5 single reviewer / Step 7 R3 / Step 8 R4 / Step 8.5 specialist) or
 *   the reviewer-merge patch application logic. Words with character_id
 *   beginning `dc_*` get attached to sub_module slots whose id begins `ac_*`
 *   (and vice-versa). This is a HARD FAIL gate — the chain must not render
 *   when this incoherence is present; downstream physics critics will catch
 *   it every time and score the document as "incoherent".
 *
 * Algorithm:
 *   For every (sub_module_id, word.content_character.character_id) pair:
 *     - Infer sub_module domain:
 *         "ac" if id starts with "ac_" OR contains "_ac_"
 *         "dc" if id starts with "dc_" OR contains "_dc_"
 *         null otherwise (skip — sub_module is not domain-coded)
 *     - Infer word domain from character_id:
 *         "ac" if character_id starts with "ac_" OR contains "_ac_"
 *         "dc" if character_id starts with "dc_" OR contains "_dc_"
 *         null otherwise (skip — word is not domain-coded)
 *     - If both are non-null AND they differ → HIGH finding.
 *
 * False-positive guards:
 *   - Sub-modules without a domain prefix (e.g. emc_grounding, fire_suppression)
 *     are skipped — no expected_domain to enforce.
 *   - Words whose character_id has no domain prefix are skipped — the gate
 *     only catches CONFLICTING domain markers, not absent ones.
 *   - L47 scope is dc/ac only. The same composition smear can in principle
 *     happen with hv_/lv_ or primary_/secondary_; those are deferred until
 *     a chain reproduces the failure with those prefixes.
 *
 * Acceptable behaviour when the guard catches a smear:
 *   - Reports all hits with full location, expected_domain, actual_domain.
 *   - Exits 29 with a clear message.
 *   - The fix is in the UPSTREAM composition step — operator updates either
 *     the deterministic-emitter slot list or the reviewer prompt to stop the
 *     smear. This gate does not silently relocate words; that's a chain
 *     authoring decision.
 *
 * Pre-change mempalace search: "reviewer-merge ID preservation modifier characters word.id"
 *   + "submodule composition AC DC domain guard"
 *   → 10 drawers loaded (sub_module shape, ID preservation, applyPatches duplicate behaviour).
 *   No prior drawer specifically codifies dc/ac domain enforcement, which is
 *   why this gate is new (not a regression of an older guard).
 *
 * EXIT CODE 29 registered in CLAUDE.md chain exit codes table.
 */

// ── Minimal type surface ──────────────────────────────────────────────────────

export interface SubModuleDomainContentCharacter {
  character_id?: string | null
  name_human?: string | null
}

export interface SubModuleDomainWord {
  id?: string
  content_character?: SubModuleDomainContentCharacter | null
}

export interface SubModuleDomainSubModule {
  id?: string
  words?: SubModuleDomainWord[]
}

export interface SubModuleDomainModule {
  module?: string
  sub_modules?: SubModuleDomainSubModule[]
}

export type Domain = 'ac' | 'dc' | null

export interface SubModuleDomainHit {
  module_id: string
  sub_module_id: string
  word_id: string
  character_id: string
  expected_domain: 'ac' | 'dc'
  actual_domain: 'ac' | 'dc'
}

export interface SubModuleDomainGuardResult {
  passed: boolean
  hits: SubModuleDomainHit[]
  words_checked: number
  /** Multi-line human-readable message for chain exit log. */
  error_message: string | null
}

// ── Domain inference ──────────────────────────────────────────────────────────

/**
 * inferDomain — read a sub_module_id or character_id and return its DC/AC
 * domain marker. Returns null when the id has no domain prefix.
 *
 * Rules (L47 scope):
 *   "ac" if id starts with "ac_" OR contains "_ac_"
 *   "dc" if id starts with "dc_" OR contains "_dc_"
 *   null otherwise.
 *
 * Edge case: an id like "ac_dc_converter_word" mentions BOTH ac AND dc.
 * Such bidirectional words legitimately straddle the boundary (rectifiers,
 * inverter front-ends). We treat them as "null" (skip) so they do NOT trip
 * the guard regardless of which sub_module they're pinned to.
 */
export function inferDomain(id: string | null | undefined): Domain {
  if (!id) return null
  const s = String(id).toLowerCase()
  const hasAc = /^ac_/.test(s) || /_ac_/.test(s)
  const hasDc = /^dc_/.test(s) || /_dc_/.test(s)
  if (hasAc && hasDc) return null // bidirectional / mixed-domain — skip
  if (hasAc) return 'ac'
  if (hasDc) return 'dc'
  return null
}

// ── Core guard ────────────────────────────────────────────────────────────────

/**
 * runSubModuleDomainGuard — walks every (sub_module, word) pair, asserts that
 * word.content_character.character_id's domain matches the parent sub_module's
 * domain when BOTH are domain-coded.
 *
 * @param modules  The design.modules array (state.moduleDecomposition.modules).
 */
export function runSubModuleDomainGuard(
  modules: SubModuleDomainModule[] | null | undefined,
): SubModuleDomainGuardResult {
  const hits: SubModuleDomainHit[] = []
  let wordsChecked = 0

  const safeMods = Array.isArray(modules) ? modules : []

  for (const m of safeMods) {
    const moduleId = String(m?.module ?? 'unknown_module')
    const subs = Array.isArray(m?.sub_modules) ? m.sub_modules : []

    for (const sm of subs) {
      const subModuleId = String(sm?.id ?? 'unknown_sub_module')
      const expected = inferDomain(subModuleId)
      // Skip sub-modules without a clear domain prefix — no rule to apply.
      if (expected === null) continue

      const words = Array.isArray(sm?.words) ? sm.words : []
      for (const w of words) {
        const wordId = String(w?.id ?? 'unknown_word')
        const cc = w?.content_character
        const characterId = cc?.character_id ? String(cc.character_id) : ''
        if (!characterId) continue

        wordsChecked++
        const actual = inferDomain(characterId)
        if (actual === null) continue
        if (actual === expected) continue

        // Domain mismatch — HIGH finding.
        hits.push({
          module_id: moduleId,
          sub_module_id: subModuleId,
          word_id: wordId,
          character_id: characterId,
          expected_domain: expected,
          actual_domain: actual,
        })
      }
    }
  }

  const passed = hits.length === 0
  let errorMessage: string | null = null
  if (!passed) {
    const lines: string[] = [
      `[Gate 29 / exit 29] Sub-module domain guard FAIL — ${hits.length} hit(s):`,
    ]
    for (const h of hits.slice(0, 20)) {
      lines.push(
        `  @ ${h.module_id}::${h.sub_module_id} :: word=${h.word_id} ` +
        `character_id=${h.character_id} — expected ${h.expected_domain.toUpperCase()} ` +
        `domain, got ${h.actual_domain.toUpperCase()}.`
      )
    }
    if (hits.length > 20) {
      lines.push(`  ... and ${hits.length - 20} more.`)
    }
    lines.push('')
    lines.push('Root cause: an upstream sub-module composition step pinned a')
    lines.push('  domain-coded word into a parent sub_module of the opposite domain.')
    lines.push('  Likely culprits (in chain order):')
    lines.push('    - scripts/lib/deterministic-emitter.ts (slot lists for ac_/dc_ sub_modules)')
    lines.push('    - Step 5 single reviewer prompts (Grok 4.3)')
    lines.push('    - Step 7 R3 / Step 8 R4 / Step 8.5 specialist reviewer prompts')
    lines.push('    - scripts/serial-design-chain-v2.tsx :: applyReviewerPatches() add_word_to_sub_module branch')
    lines.push('  Fix: update the OFFENDING step to stop attaching dc_* words to ac_*')
    lines.push('       sub_modules (and vice-versa). Do NOT relocate the words here;')
    lines.push('       this gate is a HARD FAIL by design.')
    errorMessage = lines.join('\n')
  }

  return {
    passed,
    hits,
    words_checked: wordsChecked,
    error_message: errorMessage,
  }
}
