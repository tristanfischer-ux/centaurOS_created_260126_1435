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
  WordSpec,
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
/**
 * Modifier kinds suppressed from every rendered prose path. Tristan directive
 * 2026-05-15, two tiers:
 *
 *   PERMANENT (never render, regardless of BoM state):
 *     - lead_time, supplier — fabricator-specific; always need a human conversation
 *       with a contract manufacturer. The engine cannot generate trustworthy lead
 *       times under any condition.
 *
 *   TEMPORARY (suppressed until BoM table + assumptions ledger exist, then on):
 *     - unit_cost_estimate_gbp, unit_cost_estimate_eur, unit_cost_estimate_usd,
 *       unit_cost, cost, price — financial metrics need to be BoM-grounded with
 *       an assumptions ledger before they can render.
 *
 * Modifier values stay in the data for downstream non-rendered consumption;
 * every render-time consumer filters them out via `filterRenderableModifiers`.
 */
const PERMANENTLY_SUPPRESSED_KINDS: ReadonlySet<string> = new Set([
  'lead_time',
  'supplier',
])
const TEMPORARILY_SUPPRESSED_KINDS: ReadonlySet<string> = new Set([
  'unit_cost_estimate_gbp',
  'unit_cost_estimate_eur',
  'unit_cost_estimate_usd',
  'unit_cost',
  'cost',
  'price',
])
const SUPPRESSED_MODIFIER_KINDS: ReadonlySet<string> = new Set([
  ...PERMANENTLY_SUPPRESSED_KINDS,
  ...TEMPORARILY_SUPPRESSED_KINDS,
])

export function filterRenderableModifiers<T extends { kind: string }>(modifiers: ReadonlyArray<T>): T[] {
  return (modifiers ?? []).filter(m => !SUPPRESSED_MODIFIER_KINDS.has(String(m?.kind ?? '').toLowerCase()))
}

export function modifierStripInline(modifiers: ReadonlyArray<ModifyingCharacter>): string {
  const renderable = filterRenderableModifiers(modifiers ?? [])
  if (renderable.length === 0) return ''
  return renderable.map(renderSingleModifier).join(', ')
}

// ---------------------------------------------------------------------------
// generateSubmoduleSentence — one English sentence per sub-module
// ---------------------------------------------------------------------------

export interface SubmoduleSentenceOptions {
  /**
   * 'compact'  — "The cell string consists of LFP prismatic cell (qty ×3920, cap 280 Ah) and cell-to-cell busbar (qty ×3808)."
   * 'verbose'  — additionally appends the topology clause if present.
   * Defaults to 'verbose'.
   */
  style?: 'compact' | 'verbose'
}

/**
 * Render the English clause for a single WordSpec:
 *   "{content_character.name_human} ({modifier_strip})"
 *
 * Returns just the name when there are no modifiers.
 */
function renderWordClause(word: WordSpec): string {
  const charName = word.content_character?.name_human
    || humaniseId(word.content_character?.character_id ?? word.id)
  const strip = modifierStripInline(word.modifier_characters ?? [])
  return strip ? `${charName} (${strip})` : charName
}

/**
 * Render the RAD-notation clause for a single WordSpec:
 *   "{character_id} ⊕ modifier1 ⊕ modifier2 ..."
 *
 * Modifiers use the trace-compact form (value+unit, no kind prefix).
 */
function renderWordRadClause(word: WordSpec): string {
  const charId = word.content_character?.character_id || word.id
  const modTokens = filterRenderableModifiers(word.modifier_characters ?? []).map(m =>
    m.unit ? `${m.value}${m.unit}` : m.value,
  )
  return [charId, ...modTokens].join(` ${GRAMMAR_OPERATORS.WITHIN_WORD} `)
}

/**
 * Generate a single English sentence describing a sub-module.
 *
 * Iterates over sub_module.words[] and joins them:
 *   EN  : "The {sub_module_name} {role_verb} {word1_clause}, {word2_clause}, ... {topology_clause}."
 *   Joins multiple words with ", " (or " and " for the last pair when exactly 2 words).
 *
 * Fallbacks:
 *   - Empty words[] → "The {sub_module_name} {role_verb} (uncategorised)."
 *   - word.content_character.name_human absent → humaniseId(character_id)
 */
export function generateSubmoduleSentence(
  subModule: SubModuleSpec,
  options?: SubmoduleSentenceOptions,
): string {
  // WS-A council R-C1 (2026-05-13): when the Tier-4/monolith multi-emitter
  // path emits a verbatim §4.5 English sentence, prefer it over the
  // deterministic build. The emitter has more context (the worked-example
  // pattern + modifier modal data) than the rule-based template here. When
  // the field is empty/absent (legacy single-emitter path), fall back to
  // the deterministic generator below — preserves backward compatibility.
  if (typeof subModule.english_sentence === 'string' && subModule.english_sentence.trim().length > 0) {
    return ensureTerminalPunctuation(subModule.english_sentence.trim())
  }
  const style = options?.style ?? 'verbose'
  const subject = subModule.name_human || humaniseId(subModule.id)
  const verb = (subModule.role_verb && subModule.role_verb.trim()) || 'comprises'
  const words = subModule.words ?? []
  const topology = (style === 'verbose' && subModule.topology_clause)
    ? ` ${subModule.topology_clause.trim()}`
    : ''

  let wordPart: string
  if (words.length === 0) {
    wordPart = '(uncategorised)'
  } else if (words.length === 1) {
    wordPart = renderWordClause(words[0])
  } else if (words.length === 2) {
    wordPart = `${renderWordClause(words[0])} and ${renderWordClause(words[1])}`
  } else {
    const allButLast = words.slice(0, -1).map(renderWordClause).join(', ')
    const last = renderWordClause(words[words.length - 1])
    wordPart = `${allButLast}, and ${last}`
  }

  const sentence = `The ${subject} ${verb} ${wordPart}${topology}`
  return ensureTerminalPunctuation(sentence)
}

// ---------------------------------------------------------------------------
// generateSubmoduleParagraph — rich multi-sentence sub-module prose
// ---------------------------------------------------------------------------

/**
 * Modifier kinds we recognise and weave into natural English. Anything not in
 * this list falls through to a `kind value` inline strip at the end.
 */
const MODIFIER_KIND_GROUPS = {
  identity: ['manufacturer', 'part_number', 'supplier'],
  quantity: ['quantity'],
  physical: ['material', 'dimensions', 'dimension', 'mass', 'mass_kg', 'form', 'colour', 'color', 'volume', 'capacity'],
  performance: ['rating_primary', 'rating_secondary', 'rating', 'voltage', 'current', 'power', 'flow_rate', 'efficiency', 'operating_temp_range', 'temp_range', 'pressure', 'frequency'],
  compliance: ['regulatory', 'ip_rating', 'certification', 'standard'],
  procurement: ['lead_time', 'unit_cost_estimate_gbp', 'unit_cost_estimate_eur', 'unit_cost'],
} as const

function pickModifier(mods: ReadonlyArray<ModifyingCharacter>, kinds: ReadonlyArray<string>): ModifyingCharacter | undefined {
  for (const k of kinds) {
    const found = mods.find(m => m.kind === k)
    if (found) return found
  }
  return undefined
}

function pickAll(mods: ReadonlyArray<ModifyingCharacter>, kinds: ReadonlyArray<string>): ModifyingCharacter[] {
  return mods.filter(m => kinds.includes(m.kind))
}

function modValue(m: ModifyingCharacter | undefined): string {
  if (!m) return ''
  const v = String(m.value ?? '').trim()
  if (!v) return ''
  return m.unit ? `${v} ${m.unit}` : v
}

/**
 * Render ONE word as a natural-English sentence (or sentence fragment) weaving
 * in every modifier with appropriate prepositions. Output is 1-2 sentences,
 * roughly 20-40 words depending on modifier density.
 *
 * Example output (with manufacturer + part_number + material + dimensions + regulatory + cost):
 *   "A Fluidmaster ½-inch WRAS-approved float valve (part FM-400, in moulded PE)
 *    measures 88 mm overall and is sourced at approximately £6.80 per unit
 *    with a 5-day lead time."
 */
function renderWordProse(word: WordSpec): string {
  const charName = word.content_character?.name_human
    || humaniseId(word.content_character?.character_id ?? word.id ?? 'component')
  const mods = word.modifier_characters ?? []

  const manufacturer = pickModifier(mods, MODIFIER_KIND_GROUPS.identity.filter(k => k === 'manufacturer'))
  const partNumber = pickModifier(mods, ['part_number'])
  const supplier = pickModifier(mods, ['supplier'])
  const quantity = pickModifier(mods, MODIFIER_KIND_GROUPS.quantity)
  const material = pickModifier(mods, ['material'])
  const dimensions = pickModifier(mods, ['dimensions', 'dimension'])
  const mass = pickModifier(mods, ['mass', 'mass_kg'])
  const form = pickModifier(mods, ['form'])
  const capacity = pickModifier(mods, ['capacity', 'volume'])
  const ratingPrimary = pickModifier(mods, ['rating_primary', 'rating'])
  const ratingSecondary = pickModifier(mods, ['rating_secondary'])
  const voltage = pickModifier(mods, ['voltage'])
  const current = pickModifier(mods, ['current'])
  const power = pickModifier(mods, ['power'])
  const flow = pickModifier(mods, ['flow_rate'])
  const efficiency = pickModifier(mods, ['efficiency'])
  const tempRange = pickModifier(mods, ['operating_temp_range', 'temp_range'])
  const pressure = pickModifier(mods, ['pressure'])
  const frequency = pickModifier(mods, ['frequency'])
  const regulatory = pickAll(mods, ['regulatory', 'certification', 'standard'])
  const ipRating = pickModifier(mods, ['ip_rating'])
  // Financial modifiers (lead_time, unit_cost) — read but SUPPRESSED in rendered
  // prose until the BoM table + assumptions ledger exist (Tristan directive
  // 2026-05-15: financial metrics absent until they are BoM-grounded). The
  // modifier values are kept in the data registry for downstream use; this
  // call-site picks them up only when SUPPRESS_FINANCIALS_IN_PROSE flips false.
  const SUPPRESS_FINANCIALS_IN_PROSE = true
  const leadTime = SUPPRESS_FINANCIALS_IN_PROSE ? null : pickModifier(mods, ['lead_time'])
  const cost = SUPPRESS_FINANCIALS_IN_PROSE ? null : pickModifier(mods, ['unit_cost_estimate_gbp', 'unit_cost'])

  // Build the opening NP — "A Fluidmaster ½-inch WRAS-approved float valve"
  const openParts: string[] = ['A']
  if (manufacturer) openParts.push(modValue(manufacturer))
  if (dimensions && !manufacturer) openParts.push(modValue(dimensions))
  if (form) openParts.push(modValue(form))
  openParts.push(charName.toLowerCase())
  let opener = openParts.join(' ')
  // Parenthetical: part number + material + dimensions (when not opener)
  const paren: string[] = []
  if (partNumber) paren.push(`part ${modValue(partNumber)}`)
  if (material) paren.push(`in ${modValue(material)}`)
  if (dimensions && manufacturer) paren.push(`${modValue(dimensions)}`)
  if (mass) paren.push(`${modValue(mass)}`)
  if (capacity) paren.push(`${modValue(capacity)} capacity`)
  if (paren.length) opener += ` (${paren.join(', ')})`
  if (quantity) {
    // Strip leading × glyph from modValue (modifier values for kind:'quantity'
    // arrive as "×4716"), parse the count, format with thousands separator, and
    // drop the indefinite article "A " from the opener when plural — otherwise
    // the prose reads "4,716× A name" which mis-parses. Fixes the "x4716 x A name"
    // pattern documented in drawer_forgeos_gotchas_227e3c8fd74fcd32: original line
    // emitted "×N × A name", which render-minimal-pdf.tsx:115 (.replace(/×/g, 'x'))
    // then collapsed to ASCII "xN x A name" — pervasive and unreadable.
    const rawQ = modValue(quantity).replace(/^×\s*/, '').trim()
    const qNum = parseInt(rawQ.replace(/[^\d]/g, ''), 10)
    if (Number.isFinite(qNum) && qNum > 1) {
      const formatted = qNum.toLocaleString('en-GB')
      const openerNoArticle = opener.replace(/^A\s+/, '')
      opener = `${formatted}× ${openerNoArticle}`
    }
    // For quantity == 1 (or unparseable), leave the singular "A {name}" alone.
  }

  // Performance clause — combine ratings, voltage, current, power, etc.
  const perfBits: string[] = []
  if (ratingPrimary) perfBits.push(`rated ${modValue(ratingPrimary)}`)
  if (ratingSecondary) perfBits.push(`secondary rating ${modValue(ratingSecondary)}`)
  if (voltage) perfBits.push(`${modValue(voltage)} nominal`)
  if (current) perfBits.push(`${modValue(current)} continuous current`)
  if (power) perfBits.push(`${modValue(power)} power`)
  if (flow) perfBits.push(`${modValue(flow)} flow`)
  if (pressure) perfBits.push(`${modValue(pressure)} working pressure`)
  if (frequency) perfBits.push(`${modValue(frequency)}`)
  if (efficiency) perfBits.push(`${modValue(efficiency)} efficiency`)
  if (tempRange) perfBits.push(`operating over ${modValue(tempRange)}`)
  const perfClause = perfBits.length ? `, ${perfBits.join(', ')}` : ''

  // Compliance clause
  const certs: string[] = []
  if (regulatory.length) certs.push(...regulatory.map(modValue).filter(Boolean))
  if (ipRating) certs.push(modValue(ipRating))
  const complianceClause = certs.length ? `, certified to ${certs.join(' and ')}` : ''

  // Procurement clause. Strip any leading currency symbol/code the LLM may have
  // emitted (e.g. "£450", "GBP 450") so we never double-prefix as "££450".
  const procBits: string[] = []
  if (supplier) procBits.push(`sourced via ${modValue(supplier)}`)
  if (leadTime) procBits.push(`${modValue(leadTime)} lead time`)
  if (cost) {
    const raw = modValue(cost)
    const numericOnly = raw.replace(/^\s*(?:£|\$|€|GBP|USD|EUR)\s*/i, '').trim()
    procBits.push(`approximately £${numericOnly} per unit`)
  }
  const procClause = procBits.length ? ` Procurement: ${procBits.join('; ')}.` : ''

  // Fallthrough: anything we didn't pick up
  const recognised = new Set<string>([
    ...MODIFIER_KIND_GROUPS.identity,
    ...MODIFIER_KIND_GROUPS.quantity,
    ...MODIFIER_KIND_GROUPS.physical,
    ...MODIFIER_KIND_GROUPS.performance,
    ...MODIFIER_KIND_GROUPS.compliance,
    ...MODIFIER_KIND_GROUPS.procurement,
  ])
  const leftovers = mods.filter(m => !recognised.has(m.kind))
  const leftoverClause = leftovers.length
    ? ` (additional: ${leftovers.map(m => `${humaniseId(m.kind)}: ${modValue(m)}`).join('; ')})`
    : ''

  return ensureTerminalPunctuation(`${opener}${perfClause}${complianceClause}${leftoverClause}${procClause}`.trim())
}

/**
 * Generate a multi-sentence English paragraph for ONE sub-module, weaving every
 * word + every modifier into natural prose. Target length: ~150-200 words for
 * a sub-module with 5-7 words each carrying 5-10 modifiers. This is the
 * "rich" path consumed by the §4.5 renderer.
 *
 * Bug history (2026-05-15): the previous gate `llmProse.length >= 200` was
 * length-only and silently dropped words from the BoM-grade output. A 220-char
 * single-sentence LLM emission "looks substantial" but only names 4 of 5
 * words. iter-47 dropped suppression_control_panel, vent_sealant, e_stop_enclosure,
 * detector_dust_cover, and 4/5 of thermal_runaway_detection. Because the BoM
 * is aggregated from the words[] (not prose), the visible prose mismatched
 * the BoM data. Fix: WORD-COVERAGE check — use LLM prose only when EVERY
 * word.name_human or content_character.name_human appears in it.
 */
function llmProseCoversAllWords(llmProse: string, words: ReadonlyArray<WordSpec>): boolean {
  if (!llmProse) return false
  const lower = llmProse.toLowerCase()
  for (const w of words) {
    const candidates = [
      w.content_character?.name_human,
      w.name_human,
      humaniseId(w.content_character?.character_id ?? w.id ?? ''),
    ].filter((s): s is string => !!s && s.length > 0)
    const present = candidates.some(c => lower.includes(c.toLowerCase()))
    if (!present) return false
  }
  return true
}

/**
 * Walk every sub-module and pre-apply the deterministic prose fallback to any
 * sub-module whose LLM-emitted english_sentence drops words from words[].
 *
 * Universal fix (2026-05-15): the sub_module_prose_covers_words gate was
 * firing on 36/51 VF sub-modules and similar shapes on BESS/heatpump, because
 * the LLM english_sentence often picks 3-of-5 components for prose flow.
 * Phase 2 repair has to ask the LLM to rewrite the sentence — slow, expensive,
 * and not always successful.
 *
 * Generate the deterministic prose once at the end of Phase 1 (already covers
 * every word by construction via renderWordProse). The data the gate sees is
 * self-consistent; gate goes silent; renderer doesn't have to choose at render
 * time. Net effect on quality: tiny — deterministic prose was already the
 * render-time fallback. Net effect on Phase 2 repair count: large.
 */
export function ensureSubmoduleProseCoversWords(modules: ReadonlyArray<ModuleSpec>): {
  sub_modules_rewritten: number
  total_sub_modules: number
} {
  let rewritten = 0
  let total = 0
  for (const m of modules ?? []) {
    for (const sm of ((m as any).sub_modules ?? [])) {
      total++
      const words = sm.words ?? []
      if (words.length === 0) continue
      const current = (sm.english_sentence ?? '').trim()
      if (current && llmProseCoversAllWords(current, words)) continue
      sm.english_sentence = generateSubmoduleParagraph(sm)
      rewritten++
    }
  }
  return { sub_modules_rewritten: rewritten, total_sub_modules: total }
}

export function generateSubmoduleParagraph(subModule: SubModuleSpec): string {
  const llmProse = (subModule.english_sentence ?? '').trim()
  const words = subModule.words ?? []
  // Use LLM prose only when it names every word. Length alone is insufficient.
  if (llmProse.length >= 150 && llmProseCoversAllWords(llmProse, words)) {
    return ensureTerminalPunctuation(llmProse)
  }

  const subject = subModule.name_human || humaniseId(subModule.id)
  const verb = (subModule.role_verb && subModule.role_verb.trim()) || 'comprises'
  const topology = (subModule.topology_clause ?? '').trim()

  if (words.length === 0) {
    return ensureTerminalPunctuation(`The ${subject} ${verb} no specified components`)
  }

  // Opener: name + role
  const opener = `The ${subject} ${verb} ${words.length} component${words.length === 1 ? '' : 's'}.`

  // Per-word prose
  const wordSentences = words.map(renderWordProse)

  // Topology closer
  const closer = topology ? ` ${ensureTerminalPunctuation(topology)}` : ''

  return [opener, ...wordSentences, closer].filter(Boolean).join(' ').trim()
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
 * Format (per-sub-module clause): all words within the sub-module joined by ⊕,
 * sub-module clauses joined with link operators.
 *
 *   word1_id ⊕ mod1 ⊕ mod2 ⊕ word2_id ⊕ mod1 ↔[mechanism] other_sub_id ...
 *
 * Modifiers are joined with `⊕` (within-word combine). Sub-module clauses
 * are joined with the link operators (`↔` for mutual, `→` for directional)
 * tagged with the mechanism in square brackets. Disconnected sub-modules
 * are joined with ` + ` (AND).
 *
 * Example (BESS energy_storage, cell_string sub-module):
 *   lfp_prismatic_cell ⊕ ×3920 ⊕ 280Ah ⊕ prismatic ⊕ 35s×112 ⊕ 3.2V ⊕ 6000cyc ⊕ IEC 62619 ⊕
 *   cell_to_cell_busbar ⊕ ×3808 ⊕ 350A
 *
 * Returns an empty string when the ModuleSpec has no sub-modules.
 */
export function generateGrammarTrace(moduleSpec: ModuleSpec): string {
  const subs = moduleSpec.sub_modules ?? []
  if (subs.length === 0) return ''
  const links = moduleSpec.grammar_links ?? []

  // Pre-render each sub-module's clause from its words[]. Each word renders as
  // "char_id ⊕ mod1 ⊕ mod2"; words within a sub-module are joined by ⊕ as well.
  //
  // Coding-council 1B 2026-05-12 P3 fix: the ⊕ operator is overloaded — it joins
  // both (a) content character + modifier characters WITHIN a word AND (b) words
  // WITHIN a sub-module. Without disambiguation the trace `char_a ⊕ m1 ⊕ m2 ⊕
  // char_b ⊕ m3` is ambiguous between two-word sub-module {a:(m1,m2), b:(m3)}
  // and one-word sub-module {a:(m1,m2,b,m3)}. Brackets per-word clauses for
  // multi-word sub-modules so the Iter-5 parser (and human readers) can recover
  // the structure unambiguously. Single-word sub-modules render without brackets
  // since there is no ambiguity.
  const subClauseById = new Map<string, string>()
  for (const sub of subs) {
    const words = sub.words ?? []
    if (words.length === 0) {
      subClauseById.set(sub.id, humaniseId(sub.id))
      continue
    }
    const wordClauses = words.map(w => renderWordRadClause(w))
    let clause: string
    if (wordClauses.length === 1) {
      clause = wordClauses[0]
    } else {
      // Multi-word: bracket each word so within-word ⊕ stays distinguishable from
      // between-word ⊕. Format: `[char ⊕ m1 ⊕ m2] ⊕ [char_b ⊕ m3]`.
      clause = wordClauses.map(w => `[${w}]`).join(` ${GRAMMAR_OPERATORS.WITHIN_WORD} `)
    }
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

// (modifierTokenForTrace removed in Piece 1B.1 — logic inlined into renderWordRadClause)

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
// Piece 1E (2026-05-12) — NaturalLanguageLayer: pipeline-time wiring
// ---------------------------------------------------------------------------

/**
 * Per-sub-module sentence pair (English + RAD interlinear).
 * Mirrors the §4.5 worked-example display where each sub-module is rendered
 * twice — plain English on top, radical syntax just below.
 */
export interface SubModuleSentencePair {
  sub_module_id: string
  sentence_en: string
  sentence_rad: string
  /**
   * Phase-A addition (2026-05-15): rich 150-200 word prose paragraph for the
   * §4.5 renderer, weaving every word + every modifier_character into natural
   * English. The deterministic builder is in `generateSubmoduleParagraph()`;
   * LLM-emitted `english_sentence` is preferred when substantial.
   */
  paragraph_en: string
}

/**
 * Per-module natural-language layer output: one paragraph (EN + RAD) for the
 * whole module, the canonical grammar trace string, and the sentence pairs for
 * each sub-module within the module. Drives the §4.5 PDF renderer.
 */
export interface ModuleNaturalLanguage {
  module: string
  paragraph_en: string         // deterministic, always present
  paragraph_en_llm?: string    // LLM-augmented, present when Piece 1F succeeded
  paragraph_rad: string
  grammar_trace: string
  sub_module_sentences: SubModuleSentencePair[]
}

/**
 * Top-level natural-language layer output. Keyed by UniversalModule string for
 * direct lookup. Serialises cleanly to JSON for state.json persistence.
 */
export interface NaturalLanguageLayer {
  /** One ModuleNaturalLanguage entry per module in ModuleDecomposition.modules. */
  by_module: Record<string, ModuleNaturalLanguage>
  /**
   * Wall-clock + content telemetry — useful for cost-monitor + scorecard correlation.
   * NO LLM calls are made by this layer; it is purely deterministic generation
   * from Stage 1.5's structured output.
   */
  generated_at: string
  module_count: number
}

/**
 * Render the natural-language layer for an entire ModuleDecomposition. Pure
 * function — no LLM calls, fully deterministic from the ModuleSpec input. Safe
 * to call from the orchestrator immediately after Stage 1.5 completes.
 *
 * For each module:
 *   - paragraph_en = generateModuleParagraph(module, sub_module_sentences.map(en))
 *   - paragraph_rad = the RAD-syntax variant (words joined by ⊕, sentences by ↔)
 *   - grammar_trace = generateGrammarTrace(module) (symbolic compact form)
 *   - sub_module_sentences[] = one entry per sub_module with EN + RAD pair
 */
export function buildNaturalLanguageLayer(
  modules: ReadonlyArray<ModuleSpec>,
): NaturalLanguageLayer {
  const byModule: Record<string, ModuleNaturalLanguage> = {}

  for (const moduleSpec of modules) {
    // Per-sub-module sentence pairs
    const subSentences: SubModuleSentencePair[] = []
    const enSubSentences: string[] = []
    for (const sub of moduleSpec.sub_modules ?? []) {
      const en = generateSubmoduleSentence(sub, { style: 'verbose' })
      const rad = generateSubmoduleRadSentence(sub)
      const paragraph = generateSubmoduleParagraph(sub)
      subSentences.push({
        sub_module_id: sub.id,
        sentence_en: en,
        sentence_rad: rad,
        paragraph_en: paragraph,
      })
      enSubSentences.push(en)
    }

    // Module paragraph (EN) — uses the same prose-style generator as before
    const paragraphEn = generateModuleParagraph(moduleSpec, enSubSentences)

    // Module paragraph (RAD) — concatenate sub-module RAD sentences with ↔
    // mechanism-tagged operators reflecting the module's grammar_links. Falls
    // back to ⊕ AND between sub-modules with no declared link.
    const paragraphRad = generateModuleRadParagraph(moduleSpec, subSentences)

    // Canonical symbolic grammar trace (reusable for parser round-trip in Iter 5)
    const grammarTrace = generateGrammarTrace(moduleSpec)

    byModule[moduleSpec.module] = {
      module: moduleSpec.module,
      paragraph_en: paragraphEn,
      paragraph_rad: paragraphRad,
      grammar_trace: grammarTrace,
      sub_module_sentences: subSentences,
    }
  }

  return {
    by_module: byModule,
    generated_at: new Date().toISOString(),
    module_count: modules.length,
  }
}

/**
 * Render one sub-module as its RAD-syntax sentence: each word as
 * "character_id (modifier1, modifier2)", words joined by " ⊕ ".
 * For multi-word sub-modules, brackets per-word clauses to disambiguate
 * within-word ⊕ from between-word ⊕ (council 2026-05-12 P3 fix).
 */
function generateSubmoduleRadSentence(sub: SubModuleSpec): string {
  // WS-A council R-C1 (2026-05-13): prefer the LLM-emitted verbatim §4.5
  // RAD-syntax line over the deterministic build when present. Falls back
  // to the deterministic word-by-word render for the legacy path.
  if (typeof sub.rad_syntax === 'string' && sub.rad_syntax.trim().length > 0) {
    return sub.rad_syntax.trim()
  }
  const words = sub.words ?? []
  if (words.length === 0) return `<${sub.id}>`
  const wordClauses = words.map(w => renderWordRadClause(w))
  if (wordClauses.length === 1) return wordClauses[0]
  return wordClauses.map(w => `[${w}]`).join(` ${GRAMMAR_OPERATORS.WITHIN_WORD} `)
}

/**
 * Render the whole module as a RAD-syntax paragraph: sub-module RAD sentences
 * joined by the appropriate grammar link operator (↔ mutual / → directional),
 * tagged with mechanism. Disconnected sub-modules joined by AND.
 */
function generateModuleRadParagraph(
  moduleSpec: ModuleSpec,
  subSentences: ReadonlyArray<SubModuleSentencePair>,
): string {
  const radById = new Map<string, string>()
  for (const s of subSentences) radById.set(s.sub_module_id, s.sentence_rad)

  const links = moduleSpec.grammar_links ?? []
  const visited = new Set<string>()
  const segments: string[] = []

  // Coding-council 2026-05-12 fix: original implementation chained
  // "OP toRad" after the first segment, dropping the from-side. That broke
  // fan-out topologies (A→B and A→C — second link rendered without A).
  // Now every link emits the full "fromRad OP toRad" pair as its own segment;
  // the reader can deduplicate by sub-module repetition rather than rely on
  // implicit chaining. Renderer joins segments with comma+space.
  for (const link of links) {
    const fromRad = radById.get(link.from_sub_module) ?? `<${link.from_sub_module}>`
    const toRad = radById.get(link.to_sub_module) ?? `<${link.to_sub_module}>`
    const op = link.type === 'mutual'
      ? GRAMMAR_OPERATORS.MUTUAL_LINK
      : GRAMMAR_OPERATORS.DIRECTIONAL_LINK
    const detail = link.detail ? ` (${link.detail})` : ''
    const opTagged = `${op}[${humaniseMechanism(link.mechanism)}${detail}]`
    segments.push(`${fromRad} ${opTagged} ${toRad}`)
    visited.add(link.from_sub_module)
    visited.add(link.to_sub_module)
  }

  for (const s of subSentences) {
    if (!visited.has(s.sub_module_id)) {
      if (segments.length === 0) {
        segments.push(s.sentence_rad)
      } else {
        segments.push(`${GRAMMAR_OPERATORS.AND.trim()} ${s.sentence_rad}`)
      }
    }
  }

  // Coding-council 2026-05-12: join segments with commas now that each
  // segment is a full "from OP to" pair (was bare spaces when segments
  // chained as "OP to" — caused fan-out topologies to silently drop the from).
  return segments.join(', ').replace(/\s+/g, ' ').trim()
}

// ---------------------------------------------------------------------------
// Re-exports for ergonomic call sites
// ---------------------------------------------------------------------------

export type { GrammarLink, GrammarMechanism, ModifyingCharacter, ModuleSpec, SubModuleSpec, WordSpec }
