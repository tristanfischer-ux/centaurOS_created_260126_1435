import type { ChainAuditIssue, ChainModifier, ChainV2Analysis, ChainV2State, ChainWord } from './types'

export function analyzeChainV2State(state: ChainV2State): ChainV2Analysis {
  const modules = state.moduleDecomposition.modules ?? []
  const subModules = modules.flatMap(module => module.sub_modules ?? [])
  const words = subModules.flatMap(subModule => subModule.words ?? [])
  const moduleGrammarLinks = modules.flatMap(module => module.grammar_links ?? [])
  const crossModuleLinks = state.moduleDecomposition.cross_module_grammar_links ?? []
  const pricedWords = words.filter(word => parseMoney(getModifier(word, 'unit_cost_estimate_gbp')) !== null)
  const estimatedBomTotalGbp = words.reduce((sum, word) => {
    const qty = parseQuantity(getModifier(word, 'quantity')) ?? 1
    const unit = parseMoney(getModifier(word, 'unit_cost_estimate_gbp')) ?? 0
    return sum + qty * unit
  }, 0)

  const issues: ChainAuditIssue[] = []
  if (modules.length < 8) issues.push({ severity: 'major', code: 'low_module_count', message: `Only ${modules.length} modules found; rich BESS decomposition normally needs container, power, controls, safety, thermal and service modules.` })
  if (subModules.length < 30) issues.push({ severity: 'major', code: 'low_submodule_count', message: `Only ${subModules.length} sub-modules found; expected 30+ for detailed engineering review.` })
  if (words.length < 120) issues.push({ severity: 'major', code: 'low_component_word_count', message: `Only ${words.length} component words found; expected 120+ before BoM review.` })
  if (crossModuleLinks.length < 10) issues.push({ severity: 'major', code: 'low_cross_module_link_count', message: `Only ${crossModuleLinks.length} cross-module links found; system interfaces are under-specified.` })

  for (const module of modules) {
    if (!module.sub_modules?.length) {
      issues.push({ severity: 'blocker', code: 'module_has_no_submodules', message: `${module.display_name ?? module.module} has no sub-modules.` })
    }
    if (!module.overview_paragraph_en || module.overview_paragraph_en.split(/\s+/).length < 40) {
      issues.push({ severity: 'minor', code: 'thin_module_overview', message: `${module.display_name ?? module.module} has a thin overview paragraph.` })
    }
  }

  for (const subModule of subModules) {
    if (!subModule.words?.length) {
      issues.push({ severity: 'blocker', code: 'submodule_has_no_words', message: `${subModule.name_human} has no component words.` })
    }
    if (!subModule.english_sentence || subModule.english_sentence.split(/\s+/).length < 12) {
      issues.push({ severity: 'minor', code: 'thin_submodule_sentence', message: `${subModule.name_human} lacks a useful engineering sentence.` })
    }
  }

  return {
    moduleCount: modules.length,
    subModuleCount: subModules.length,
    wordCount: words.length,
    moduleGrammarLinkCount: moduleGrammarLinks.length,
    crossModuleLinkCount: crossModuleLinks.length,
    pricedWordCount: pricedWords.length,
    pricedWordRatio: words.length ? pricedWords.length / words.length : 0,
    estimatedBomTotalGbp,
    issues,
  }
}

export function getModifier(word: ChainWord, kind: string): string | undefined {
  return word.modifier_characters?.find(modifier => modifier.kind === kind)?.value
}

export function modifiersByKind(modifiers: ChainModifier[] | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const modifier of modifiers ?? []) out[modifier.kind] = modifier.value
  return out
}

export function parseQuantity(value: string | undefined): number | null {
  if (!value) return null
  const match = value.replace(/,/g, '').match(/[-+]?\d*\.?\d+/)
  return match ? Number(match[0]) : null
}

export function parseMoney(value: string | undefined): number | null {
  if (!value) return null
  const match = value.replace(/,/g, '').replace(/[£$]/g, '').match(/[-+]?\d*\.?\d+/)
  return match ? Number(match[0]) : null
}

export function formatGbp(value: number): string {
  return `GBP ${Math.round(value).toLocaleString('en-GB')}`
}
