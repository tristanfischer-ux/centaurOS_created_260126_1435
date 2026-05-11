/**
 * @file sentence-generator.ts — Deterministic English + grammar-trace generators.
 *
 * Iter 4 — natural-language layer (memory drawer
 * `forgeos_decisions_393756e2f253f189`).
 *
 * Pure functions over the structured ModuleSpec / SubModuleSpec / GrammarLink
 * types. NO LLM calls, NO I/O, NO side effects. Given identical input, the
 * output is byte-for-byte identical — a hard requirement so the natural-
 * language layer can be re-rendered without recomputing snapshots.
 *
 * Round-trip plan: Iter 5 introduces the inverse parser
 * (English → SubModuleSpec) so the engineering grammar becomes a true
 * round-trippable language. THIS file is the structure → English direction
 * only; do NOT add parsing here.
 *
 * Outputs:
 *   - generateSubmoduleSentence    — one English sentence per sub-module
 *   - generateModuleSentence       — single-sentence summary of a ModuleSpec
 *   - generateModuleParagraph      — multi-sentence paragraph (sub-modules + grammar links)
 *   - generateGrammarTrace         — symbolic engineering-grammar trace
 *   - humaniseId / modifierStripInline — exposed helpers (also covered by tests)
 */

import type {
  GrammarLink,
  GrammarMechanism,
  ModifyingCharacter,
  ModuleSpec,
  SubModuleSpec,
} from '../types/module-decomposition'
import { MODULE_LABELS } from '../types/module-decomposition'

// ---------------------------------------------------------------------------
// Grammar operators (consumed by generateGrammarTrace and downstream renderers)
// ---------------------------------------------------------------------------

/**
 * Engineering-grammar symbolic operators.
 *
 *   ⊕ (WITHIN_WORD)        — primary character + modifiers combine inside a word
 *   ↔ (MUTUAL_LINK)        — bidirectional sub-module link
 *   → (DIRECTIONAL_LINK)   — one-way command/flow link
 *   + (AND)                — conjunction between sibling clauses
 *   ( )                    — modifier-strip wrapping
 *
 * Treat as a single source of truth: PDF renderers, debug views, and
 * round-trip parsers MUST import these — never hard-code the glyphs in
 * call sites.
 */
export const GRAMMAR_OPERATORS = {
  WITHIN_WORD: '⊕',
  MUTUAL_LINK: '↔',
  DIRECTIONAL_LINK: '→',
  AND: ' + ',
  PARENTHESES: ['(', ')'] as const,
} as const

export type GrammarOperator = typeof GRAMMAR_OPERATORS[keyof typeof GRAMMAR_OPERATORS]

// ---------------------------------------------------------------------------
// humaniseId — snake_case → human-readable with acronym preservation
// ---------------------------------------------------------------------------

/**
 * Acronym preservation map. Tokens that match a key (case-insensitive) are
 * emitted in the canonical capitalisation, not Title Case.
 *
 * Extension policy: add domain acronyms here as new product classes onboard;
 * keep the value in the canonical industry capitalisation (eg `'IGBT'`,
 * not `'Igbt'`).
 */
export const ACRONYM_MAP: Record<string, string> = {
  // Electrical / power-electronics
  bms: 'BMS',
  pcb: 'PCB',
  pcs: 'PCS',
  ems: 'EMS',
  scada: 'SCADA',
  igbt: 'IGBT',
  mosfet: 'MOSFET',
  mppt: 'MPPT',
  ups: 'UPS',
  pdu: 'PDU',
  // Battery chemistries
  lfp: 'LFP',
  nmc: 'NMC',
  nca: 'NCA',
  lto: 'LTO',
  // Safety / monitoring
  imd: 'IMD',
  fmea: 'FMEA',
  drc: 'DRC',
  rcd: 'RCD',
  emc: 'EMC',
  esd: 'ESD',
  // Comms / interfaces
  can: 'CAN',
  spi: 'SPI',
  i2c: 'I2C',
  uart: 'UART',
  rs485: 'RS485',
  hmi: 'HMI',
  api: 'API',
  // Standards
  iec: 'IEC',
  iso: 'ISO',
  ip: 'IP',
  un: 'UN',
  ce: 'CE',
  ul: 'UL',
  // Forms
  ac: 'AC',
  dc: 'DC',
  pv: 'PV',
  ro: 'RO',
  // Aviation / vehicles
  auv: 'AUV',
  haps: 'HAPS',
  ev: 'EV',
  cgm: 'CGM',
}

/**
 * Convert a snake_case identifier to a human-readable phrase, preserving
 * canonical acronym capitalisation and lower-casing other tokens.
 *
 * Examples:
 *   humaniseId('lfp_prismatic_cell')   → 'LFP prismatic cell'
 *   humaniseId('bms_master_pcb')       → 'BMS master PCB'
 *   humaniseId('cell_string')          → 'cell string'
 *   humaniseId('high_voltage_dc')      → 'high voltage DC'
 *   humaniseId('')                     → ''
 */
export function humaniseId(id: string): string {
  if (!id) return ''
  // Tolerate kebab-case and CamelCase by collapsing both to lowercase tokens
  // before the acronym rewrite — keeps callers from pre-normalising.
  const normalised = id
    .replace(/[-]+/g, '_')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase()
  const tokens = normalised.split(/_+/).filter(t => t.length > 0)
  if (tokens.length === 0) return ''
  return tokens
    .map(token => {
      const acronym = ACRONYM_MAP[token]
      if (acronym) return acronym
      return token
    })
    .join(' ')
}

// ---------------------------------------------------------------------------
// modifierStripInline — render a list of modifying characters as a parenthesised inline
// ---------------------------------------------------------------------------

/**
 * Canonical short-name per modifier kind. Keeps the rendered strip compact
 * (eg "qty ×3920" not "quantity ×3920").
 */
const MODIFIER_KIND_SHORTNAMES: Record<string, string> = {
  quantity: 'qty',
  capacity: 'cap',
  form: 'form',
  topology: 'topo',
  dimension: 'dim',
  lifecycle: 'life',
  regulatory: '',  // regulatory values are self-describing (eg "IEC 62619") — no prefix
  performance: 'perf',
  tolerance: 'tol',
  envelope: 'env',
}

/**
 * Render a single ModifyingCharacter as its inline-strip form.
 *
 *   { kind:'quantity',   value:'×3920' }                  → 'qty ×3920'
 *   { kind:'capacity',   value:'280', unit:'Ah' }         → 'cap 280 Ah'
 *   { kind:'form',       value:'prismatic' }              → 'prismatic'
 *   { kind:'regulatory', value:'IEC 62619' }              → 'IEC 62619'
 *   { kind:'envelope',   value:'-20…+55', unit:'°C' }     → 'env -20…+55 °C'
 *
 * Form / topology values are self-explanatory and render bare.
 */
function renderSingleModifier(modifier: ModifyingCharacter): string {
  const kindKey = String(modifier.kind)
  const shortname = MODIFIER_KIND_SHORTNAMES[kindKey]
  const valueWithUnit = modifier.unit ? `${modifier.value} ${modifier.unit}` : modifier.value
  // Bare values: kind is self-evident from the value, so no prefix.
  if (kindKey === 'form' || kindKey === 'topology') return valueWithUnit
  // Regulatory / performance values frequently embed the standard name (IEC, IEEE)
  // or the metric (≥95%); rendering "perf ≥95%" reads cleaner than just "≥95%"
  // when several sit side-by-side, but regulatory should stay bare.
  if (kindKey === 'regulatory') return valueWithUnit
  // Unknown extensible kinds: render `<kind> <value>` — better than dropping the kind.
  if (shortname === undefined) return `${kindKey} ${valueWithUnit}`
  if (shortname === '') return valueWithUnit
  return `${shortname} ${valueWithUnit}`
}

/**
 * Render a list of modifying characters as a comma-separated inline strip.
 * Returns an empty string when the list is empty (not a stray "()" — the
 * caller decides whether to wrap in parentheses).
 *
 *   [{kind:'quantity', value:'×3920'},
 *    {kind:'capacity', value:'280', unit:'Ah'},
 *    {kind:'form',     value:'prismatic'}]
 *     → 'qty ×3920, cap 280 Ah, prismatic'
 */
export function modifierStripInline(modifiers: ReadonlyArray<ModifyingCharacter>): string {
  if (!modifiers || modifiers.length === 0) return ''
  return modifiers.map(renderSingleModifier).join(', ')
}

// ---------------------------------------------------------------------------
// generateSubmoduleSentence — one English sentence per sub-module
// ---------------------------------------------------------------------------

export interface SubmoduleSentenceOptions {
  /**
   * 'compact'  — "The cell string consists of 3,920 LFP prismatic cells (qty ×3920, cap 280 Ah)."
   * 'verbose'  — additionally appends the topology clause if present.
   * Defaults to 'verbose'.
   */
  style?: 'compact' | 'verbose'
}

/**
 * Generate a single English sentence describing a sub-module.
 *
 * Template:
 *   "The {sub_module_name_human} {role_verb} {primary_character_name_human}
 *    ({modifier_strip}) {topology_clause}."
 *
 * Capitalisation: sentence-initial only. The article "The" is added on
 * unconditionally — sub-module names in this layer are always definite
 * references within the parent ModuleSpec.
 */
export function generateSubmoduleSentence(
  subModule: SubModuleSpec,
  options?: SubmoduleSentenceOptions,
): string {
  const style = options?.style ?? 'verbose'
  const subject = subModule.name_human || humaniseId(subModule.id)
  const verb = (subModule.role_verb && subModule.role_verb.trim()) || 'comprises'
  const primary = subModule.primary_character_name_human
    || humaniseId(subModule.primary_character_id)
  const strip = modifierStripInline(subModule.modifiers)
  const stripWrapped = strip ? ` (${strip})` : ''
  const topology = (style === 'verbose' && subModule.topology_clause)
    ? ` ${subModule.topology_clause.trim()}`
    : ''
  // Pluralisation: rely on the LLM-provided primary_character_name_human to
  // already be in its natural plural/singular form (qty modifier signals quantity).
  const sentence = `The ${subject} ${verb} ${primary}${stripWrapped}${topology}`
  return ensureTerminalPunctuation(sentence)
}

// ---------------------------------------------------------------------------
// generateModuleSentence — single-sentence ModuleSpec summary
// ---------------------------------------------------------------------------

/**
 * Generate a one-line summary sentence for a whole ModuleSpec.
 *
 * Template:
 *   "The {module_label_human} organises {N} {sub_module_summary} with
 *    {linked_count} internal {mechanism_summary}."
 *
 * Falls back gracefully when sub_modules / grammar_links are absent (the
 * module label + module_brief are always available).
 */
export function generateModuleSentence(moduleSpec: ModuleSpec): string {
  const label = MODULE_LABELS[moduleSpec.module] || humaniseId(moduleSpec.module)
  const subs = moduleSpec.sub_modules ?? []
  const links = moduleSpec.grammar_links ?? []
  if (subs.length === 0) {
    // No sub-modules declared — fall back to module_brief verbatim, which is
    // always populated. Keeps the sentence honest about data availability.
    const brief = moduleSpec.module_brief?.trim()
    if (brief) return ensureTerminalPunctuation(brief)
    return ensureTerminalPunctuation(`The ${label} module is declared but undescribed`)
  }
  const subSummary = subs.length === 1
    ? subs[0].name_human || humaniseId(subs[0].id)
    : `${subs.length} sub-modules (${subs.map(s => s.name_human || humaniseId(s.id)).join(', ')})`
  const linkSummary = links.length === 0
    ? ''
    : ` with ${links.length} internal ${summariseMechanisms(links)}`
  return ensureTerminalPunctuation(`The ${label} module organises ${subSummary}${linkSummary}`)
}

function summariseMechanisms(links: ReadonlyArray<GrammarLink>): string {
  // Group by mechanism family for a compact summary.
  const counts = new Map<string, number>()
  for (const link of links) {
    counts.set(link.mechanism, (counts.get(link.mechanism) ?? 0) + 1)
  }
  const parts: string[] = []
  for (const [mech, n] of counts) {
    parts.push(n === 1 ? `${humaniseMechanism(mech)} link` : `${humaniseMechanism(mech)} links (×${n})`)
  }
  return parts.join(', ')
}

function humaniseMechanism(mechanism: string): string {
  return humaniseId(mechanism)
}

// ---------------------------------------------------------------------------
// generateModuleParagraph — multi-sentence paragraph (sub-modules + grammar links)
// ---------------------------------------------------------------------------

/**
 * Compose a flowing-prose paragraph from per-sub-module sentences and
 * declared grammar links.
 *
 * Layout:
 *   1. Module summary sentence (`generateModuleSentence`)
 *   2. One sentence per sub-module (caller passes pre-rendered sentences)
 *   3. One closing sentence per non-empty grammar-links group describing
 *      how the sub-modules connect.
 *
 * Caller passes pre-rendered sub-module sentences so it can dedupe,
 * reorder, or substitute. Pass [] to skip the per-sub-module body and
 * keep only the summary + link prose.
 */
export function generateModuleParagraph(
  moduleSpec: ModuleSpec,
  subModuleSentences: ReadonlyArray<string>,
): string {
  const summary = generateModuleSentence(moduleSpec)
  const body = subModuleSentences.filter(s => !!s && s.trim().length > 0).join(' ')
  const links = moduleSpec.grammar_links ?? []
  const linkProse = renderLinkProse(moduleSpec, links)
  return [summary, body, linkProse]
    .filter(p => p && p.trim().length > 0)
    .join(' ')
    .trim()
}

function renderLinkProse(moduleSpec: ModuleSpec, links: ReadonlyArray<GrammarLink>): string {
  if (links.length === 0) return ''
  const subById = new Map<string, SubModuleSpec>()
  for (const sub of moduleSpec.sub_modules ?? []) {
    subById.set(sub.id, sub)
  }
  const sentences: string[] = []
  for (const link of links) {
    const from = subById.get(link.from_sub_module)
    const to = subById.get(link.to_sub_module)
    const fromName = from?.name_human || humaniseId(link.from_sub_module)
    const toName = to?.name_human || humaniseId(link.to_sub_module)
    const mech = humaniseMechanism(link.mechanism)
    const detail = link.detail ? ` (${link.detail})` : ''
    if (link.type === 'mutual') {
      sentences.push(ensureTerminalPunctuation(`The ${fromName} and the ${toName} share a ${mech} link${detail}`))
    } else {
      sentences.push(ensureTerminalPunctuation(`The ${fromName} drives the ${toName} via ${mech}${detail}`))
    }
  }
  return sentences.join(' ')
}

// ---------------------------------------------------------------------------
// generateGrammarTrace — symbolic engineering-grammar render
// ---------------------------------------------------------------------------

/**
 * Render the engineering-grammar trace for a ModuleSpec.
 *
 * Format (per-sub-module clause):
 *   primary_id ⊕ modifier_value ⊕ modifier_value ↔[mechanism] other_id ...
 *
 * Modifiers are joined with `⊕` (within-word combine). Sub-module clauses
 * are joined with the link operators (`↔` for mutual, `→` for directional)
 * tagged with the mechanism in square brackets. Disconnected sub-modules
 * are joined with ` + ` (AND).
 *
 * Example (BESS energy_storage):
 *   lfp_prismatic_cell ⊕ ×3920 ⊕ 280Ah ⊕ prismatic ↔[mechanical mount]
 *   rack_structure ↔[PCB mounting] bms_slave →[CAN bus] bms_master
 *
 * Returns an empty string when the ModuleSpec has no sub-modules.
 */
export function generateGrammarTrace(moduleSpec: ModuleSpec): string {
  const subs = moduleSpec.sub_modules ?? []
  if (subs.length === 0) return ''
  const links = moduleSpec.grammar_links ?? []

  // Pre-render each sub-module's "primary ⊕ modifiers" clause keyed by id.
  const subClauseById = new Map<string, string>()
  for (const sub of subs) {
    const primary = sub.primary_character_id || humaniseId(sub.id)
    const modifierTokens = sub.modifiers.map(m => modifierTokenForTrace(m))
    const clause = [primary, ...modifierTokens].join(` ${GRAMMAR_OPERATORS.WITHIN_WORD} `)
    subClauseById.set(sub.id, clause)
  }

  // Walk the link list in order, chaining clauses with the appropriate operator.
  // Sub-modules not touched by any link are appended at the end with AND.
  const visited = new Set<string>()
  const segments: string[] = []
  for (const link of links) {
    const fromClause = subClauseById.get(link.from_sub_module)
      ?? `<${link.from_sub_module}>`
    const toClause = subClauseById.get(link.to_sub_module)
      ?? `<${link.to_sub_module}>`
    const op = link.type === 'mutual'
      ? GRAMMAR_OPERATORS.MUTUAL_LINK
      : GRAMMAR_OPERATORS.DIRECTIONAL_LINK
    const opTagged = `${op}[${humaniseMechanism(link.mechanism)}]`
    if (segments.length === 0) {
      segments.push(`${fromClause} ${opTagged} ${toClause}`)
    } else {
      // Appending another link — render as a continuation segment.
      segments.push(`${opTagged} ${toClause}`)
    }
    visited.add(link.from_sub_module)
    visited.add(link.to_sub_module)
  }

  // Append unlinked sub-modules with AND.
  const unlinked = subs.filter(s => !visited.has(s.id))
  for (const sub of unlinked) {
    const clause = subClauseById.get(sub.id) ?? `<${sub.id}>`
    if (segments.length === 0) segments.push(clause)
    else segments.push(`${GRAMMAR_OPERATORS.AND.trim()} ${clause}`)
  }

  return segments.join(' ').replace(/\s+/g, ' ').trim()
}

/**
 * Trace-format render of a single modifier (no kind prefix — the operator
 * `⊕` already signals the relationship).
 *
 *   { kind:'quantity', value:'×3920' }              → '×3920'
 *   { kind:'capacity', value:'280', unit:'Ah' }     → '280Ah'
 *   { kind:'form',     value:'prismatic' }          → 'prismatic'
 */
function modifierTokenForTrace(modifier: ModifyingCharacter): string {
  if (modifier.unit) return `${modifier.value}${modifier.unit}`
  return modifier.value
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function ensureTerminalPunctuation(s: string): string {
  const trimmed = s.trim()
  if (!trimmed) return ''
  const last = trimmed[trimmed.length - 1]
  if (last === '.' || last === '!' || last === '?') return trimmed
  return `${trimmed}.`
}

// ---------------------------------------------------------------------------
// Re-exports for ergonomic call sites
// ---------------------------------------------------------------------------

export type { GrammarLink, GrammarMechanism, ModifyingCharacter, ModuleSpec, SubModuleSpec }
