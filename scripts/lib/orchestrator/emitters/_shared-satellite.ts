/**
 * scripts/lib/orchestrator/emitters/_shared-satellite.ts
 *
 * SHARED TYPES + HELPERS for satellite class emitters (cubesat, smallsat,
 * geo_comsat, interplanetary). Mirrors deterministic-emitter.ts patterns.
 *
 * Each satellite emitter:
 *   1. Reads numerical quantities from contract via `qs(c, key, fallback)`
 *   2. Builds Words from helpers (`cc`, `word`, `mod`, `makeSubModule`)
 *   3. Returns a DesignJSON with module, sub_module, word, radical structure
 *
 * Quantity sourcing rule: same as BESS — all numbers come from
 * contract.quantities. No invention; if a quantity isn't in the
 * contract, we use a hard-coded class-typical default.
 */

import type { BriefEnvelope, ContractInProgress, ParsedConstraints } from '../types'
import type { DesignJSON, DesignModule } from '../assembler'

// ---------------------------------------------------------------------------
// QUANTITY READER
// ---------------------------------------------------------------------------

export function qs(c: ContractInProgress, key: string, fallback: number): number {
  const v = c.quantities?.[key]?.value
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

// ---------------------------------------------------------------------------
// WORD / SUB_MODULE / CHARACTER FACTORIES — match deterministic-emitter.ts
// ---------------------------------------------------------------------------

export interface ModifierCharacter {
  kind: string
  value: string
  unit?: string
}

export interface ContentCharacter {
  character_id: string
  name_human: string
  function_radical_primary: string | null
  function_radical_secondary: string | null
  material_radical_primary: string | null
  material_radical_secondary: string | null
}

export interface Word {
  id: string
  name_human: string
  content_character: ContentCharacter
  modifier_characters: ModifierCharacter[]
}

export interface SubModule {
  id: string
  name_human: string
  english_sentence: string
  rad_syntax: string
  role_verb: string
  topology_clause: string
  words: Word[]
}

export function mod(kind: string, value: string, unit?: string): ModifierCharacter {
  return unit !== undefined ? { kind, value, unit } : { kind, value }
}

export function cc(
  character_id: string,
  name_human: string,
  fp: string | null,
  mp: string | null,
  fs: string | null = null,
  ms: string | null = null,
): ContentCharacter {
  return {
    character_id,
    name_human,
    function_radical_primary: fp,
    function_radical_secondary: fs,
    material_radical_primary: mp,
    material_radical_secondary: ms,
  }
}

export function word(id: string, name_human: string, content: ContentCharacter, modifiers: ModifierCharacter[]): Word {
  // Universal fix #A (2026-05-22): legacy call sites passed name_human with a
  // literal " word" suffix (template-variable hangover). Strip it here so the
  // BoM Part column shows natural names ("battery cell") not "battery cell word".
  const cleanName = name_human.replace(/\s+word$/i, '')
  return { id, name_human: cleanName, content_character: content, modifier_characters: modifiers }
}

export function fmtQty(n: number): string {
  if (Number.isInteger(n)) return `×${n}`
  return `×${n.toFixed(2)}`
}

export function synthesizeRadSyntax(words: Word[]): string {
  const clusters = words.map((w) => {
    const modsOrdered = [...w.modifier_characters].sort((a, b) => {
      if (a.kind === 'quantity' && b.kind !== 'quantity') return -1
      if (b.kind === 'quantity' && a.kind !== 'quantity') return 1
      return 0
    })
    const tokens = modsOrdered.map((m) => (m.unit ? `${m.value}${m.unit}` : m.value))
    if (tokens.length === 0) return w.content_character.character_id
    return `${w.content_character.character_id} (${tokens.join(', ')})`
  })
  return clusters.join(' ⊙ ')
}

export function makeSubModule(
  id: string,
  name_human: string,
  role_verb: string,
  topology_clause: string,
  words: Word[],
): SubModule {
  return {
    id,
    name_human,
    english_sentence: '',
    rad_syntax: synthesizeRadSyntax(words),
    role_verb,
    topology_clause,
    words,
  }
}

// Build a finished DesignJSON skeleton — modules + cross_module_grammar_links + prose
export function buildDesignJSON(modules: DesignModule[], grammarLinks: unknown[], briefSummary: string): DesignJSON {
  return {
    modules,
    cross_module_grammar_links: grammarLinks,
    excluded_modules: [],
    rationale_excluded: 'All canonical modules apply.',
    brief_overview_prose: {
      overview_and_context: '',
      mission_statement: briefSummary,
      target_customers: '',
      why_now: '',
    },
  }
}

// Cross-reference helper for unused `_brief`/`_env` lints
export type SatelliteBriefArg = ParsedConstraints
export type SatelliteEnvelopeArg = BriefEnvelope
