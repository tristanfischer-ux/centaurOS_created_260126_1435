export interface ChainV2State {
  projectId: string
  parsedBrief?: {
    project_id?: string
    product_description?: string
    mission_statement?: string
    target_customers?: string[]
    why_now?: string
    constraints?: unknown
    confidence?: number
  }
  moduleDecomposition: {
    product_class?: string
    brief_overview_prose?: string
    modules: ChainModule[]
    excluded_modules?: unknown[]
    rationale_excluded?: string
    cross_module_grammar_links?: ChainGrammarLink[]
  }
  naturalLanguageLayer?: {
    by_module?: Record<string, { sub_module_sentences?: Array<{ sub_module_id: string; paragraph_en?: string; sentence_en?: string }> }>
  }
  briefOverviewProse?: string
  keyMetrics?: Record<string, unknown>
  grammarVerdicts?: unknown
  savedAt?: string
}

export interface ChainModule {
  module: string
  display_name?: string
  module_brief?: string
  overview_paragraph_en?: string
  derived_parameters?: Record<string, unknown>
  allowed_radicals?: string[]
  applicability_confidence?: string
  secondary_modules?: string[]
  sub_modules: ChainSubModule[]
  grammar_links?: ChainGrammarLink[]
}

export interface ChainSubModule {
  id: string
  name_human: string
  words: ChainWord[]
  role_verb?: string
  topology_clause?: string
  english_sentence?: string
  rad_syntax?: string
}

export interface ChainWord {
  id: string
  name_human: string
  content_character?: {
    character_id?: string
    name_human?: string
    function_radical_primary?: string | null
    function_radical_secondary?: string | null
    material_radical_primary?: string | null
    material_radical_secondary?: string | null
  }
  modifier_characters?: ChainModifier[]
}

export interface ChainModifier {
  kind: string
  value: string
}

export interface ChainGrammarLink {
  from_module?: string
  to_module?: string
  from_sub_module?: string
  to_sub_module?: string
  mechanism: string
  type?: string
  detail?: string
}

export interface ChainV2Analysis {
  moduleCount: number
  subModuleCount: number
  wordCount: number
  moduleGrammarLinkCount: number
  crossModuleLinkCount: number
  pricedWordCount: number
  pricedWordRatio: number
  estimatedBomTotalGbp: number
  issues: ChainAuditIssue[]
}

export interface ChainAuditIssue {
  severity: 'blocker' | 'major' | 'minor'
  code: string
  message: string
}
