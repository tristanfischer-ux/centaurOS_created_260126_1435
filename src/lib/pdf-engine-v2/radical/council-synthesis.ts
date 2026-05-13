/**
 * @file council-synthesis.ts — WS-A tier synthesis layer (2026-05-13).
 *
 * Per memo §7: each Tier 2 / Tier 3 / Tier 4 emission goes through 3
 * emitters + 1 checker. This file implements the synthesis rules that
 * combine the 3 emitter outputs (with checker as tiebreaker / schema gate)
 * into a single synthesised emission.
 *
 * Council remediations baked in:
 *
 *   R-C2: quantity-modifier requires ≥2/3 emitter agreement; missing →
 *         multiplicity=null + verification_status='missing-quantity'.
 *         Singleton-by-design parts (no expected quantity) are exempt.
 *
 *   R-C3: when the checker disagrees with a ≥2 emitter majority, the
 *         emitters win UNLESS the checker cites a schema violation
 *         (invalid radical_id, duplicate sub_module id, malformed RAD
 *         string). Schema violations always win.
 *
 * Generic helper `synthesiseTierEmissions` plus concrete per-tier rules:
 *   - synthesiseTier2Modules   — module catalogue (Tier 2)
 *   - synthesiseTier3SubModules — sub-module decomposition (Tier 3)
 *   - synthesiseTier4PartsRad   — parts + RAD + grammar (Tier 4)
 *
 * All callers go through these — no per-tier ad-hoc merging.
 */

import type {
  ModuleBrief,
  ModuleSpec,
  PartsRadEmission,
  SubModuleBrief,
  SubModuleSpec,
  UniversalModule,
  WordSpec,
  ContentCharacter,
  GrammarLink,
  CrossModuleGrammarLink,
  DerivedParameters,
  ApplicabilityConfidence,
  ModifyingCharacter,
  ModuleDecomposition,
  CouncilSeatReview,
  CouncilSeatId,
  CouncilVerdict,
} from '../types/module-decomposition'

// ---------------------------------------------------------------------------
// Types — generic synthesis shape
// ---------------------------------------------------------------------------

/**
 * One emitter or checker output. `ok=false` outputs are excluded from
 * synthesis (treated as a missing seat).
 */
export interface TierEmitterOutput<T> {
  ok: boolean
  data?: T
  model: string
  /** Council-style flags from the parser (schema violations, etc.). */
  schemaViolations?: string[]
}

export interface TierCheckerOutput {
  ok: boolean
  /** OK | NEEDS_MINOR | NEEDS_MAJOR */
  verdict: 'OK' | 'NEEDS_MINOR' | 'NEEDS_MAJOR'
  notes: string[]
  /**
   * R-C3: when checker NEEDS_MAJOR cites a schema-grade issue, the synthesis
   * MUST honour it even against ≥2 emitter agreement. Caller populates this
   * list when parsing the checker's response; empty = pure-opinion verdict.
   */
  schemaViolations?: string[]
  model: string
}

/**
 * Synthesised result + provenance for council_notes propagation.
 */
export interface SynthesisResult<T> {
  synthesised: T
  confidence: 'high' | 'medium' | 'low'
  disagreements: string[]
  checkerHonoured: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countableEmitters<T>(emitters: TierEmitterOutput<T>[]): T[] {
  return emitters.filter(e => e.ok && e.data !== undefined).map(e => e.data as T)
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function modalString(values: string[]): string | null {
  if (values.length === 0) return null
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best: string | null = null
  let bestCount = 0
  for (const [v, c] of counts) {
    if (c > bestCount || (c === bestCount && best !== null && v < best)) {
      best = v
      bestCount = c
    }
  }
  return best
}

function unionStrings(lists: string[][]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const list of lists) {
    for (const s of list) {
      if (!seen.has(s)) {
        seen.add(s)
        out.push(s)
      }
    }
  }
  return out
}

function majorityVote<T>(items: T[], keyOf: (t: T) => string, threshold = 2): Set<string> {
  const counts = new Map<string, number>()
  for (const it of items) counts.set(keyOf(it), (counts.get(keyOf(it)) ?? 0) + 1)
  const winners = new Set<string>()
  for (const [k, c] of counts) {
    if (c >= threshold) winners.add(k)
  }
  return winners
}

/**
 * Confidence rule: ≥2 of 3 emitters agree on the majority subset → high;
 * exactly 2/3 with checker NEEDS_MINOR → medium; <2 agree → low.
 */
function inferConfidence(
  emitterCount: number,
  agreementCount: number,
  checkerVerdict: TierCheckerOutput['verdict'],
): 'high' | 'medium' | 'low' {
  if (emitterCount === 0) return 'low'
  if (agreementCount >= 3) return 'high'
  if (agreementCount >= 2) return checkerVerdict === 'NEEDS_MAJOR' ? 'medium' : 'high'
  return 'low'
}

// ---------------------------------------------------------------------------
// R-C3: checker-vs-majority tiebreak
// ---------------------------------------------------------------------------

/**
 * Determine if the checker's verdict should override emitter consensus.
 *
 * Per memo §7 R-C3: emitters win by default. Checker overrides ONLY when
 * it cites a specific schema violation. The caller logs the checker's
 * verdict to council_notes regardless.
 */
export function checkerOverridesMajority(
  checker: TierCheckerOutput,
  emitterAgreementCount: number,
): boolean {
  if (checker.verdict !== 'NEEDS_MAJOR') return false
  if ((checker.schemaViolations?.length ?? 0) === 0) return false
  // If only 1 emitter agreed (no majority anyway), checker NEEDS_MAJOR
  // already drops the field via the union/median rules; no override needed.
  if (emitterAgreementCount < 2) return false
  return true
}

// ---------------------------------------------------------------------------
// Tier 2 synthesis — module catalogue
// ---------------------------------------------------------------------------

/**
 * Synthesise 3 emitter ModuleBrief[] outputs into a single canonical list.
 *
 * Rules (per memo §7):
 *   - Module is included if ≥2 of 3 emitters list it (majority vote on
 *     `module` field).
 *   - For each included module:
 *       module_brief        = longest of the 3 emissions (proxy: most thorough)
 *       derived_parameters  = numeric median; string params = modal value
 *       allowed_radicals    = union, BUT a radical only 1 emitter listed
 *                             drops if checker NEEDS_MAJOR
 *       applicability_confidence = take the median (high>medium>low order)
 *       secondary_modules   = union
 */
export function synthesiseTier2Modules(
  emitters: TierEmitterOutput<ModuleBrief[]>[],
  checker: TierCheckerOutput,
): SynthesisResult<ModuleBrief[]> {
  const lists = countableEmitters(emitters)
  const disagreements: string[] = []

  if (lists.length === 0) {
    return {
      synthesised: [],
      confidence: 'low',
      disagreements: ['Tier 2: no emitter produced a parseable ModuleBrief[] list'],
      checkerHonoured: false,
    }
  }

  // Majority vote on `module` key
  const flatBriefs: ModuleBrief[] = lists.flat()
  const moduleVotes = new Map<UniversalModule, ModuleBrief[]>()
  for (const mb of flatBriefs) {
    const arr = moduleVotes.get(mb.module) ?? []
    arr.push(mb)
    moduleVotes.set(mb.module, arr)
  }

  // R-C3: if the checker NEEDS_MAJOR with a schema violation, log but
  // emitters still win (modules they all agreed on stay in).
  const checkerHonoured = checkerOverridesMajority(checker, 2)
  const includedModules: ModuleBrief[] = []
  for (const [mod, variants] of moduleVotes) {
    if (variants.length < 2) {
      disagreements.push(
        `Tier 2: module "${mod}" emitted by only ${variants.length}/${lists.length} emitters; dropped`,
      )
      continue
    }

    // module_brief: longest
    let bestBrief = variants[0].module_brief
    for (const v of variants) {
      if (v.module_brief.length > bestBrief.length) bestBrief = v.module_brief
    }

    // derived_parameters: numeric median, string modal
    const allKeys = new Set<string>()
    for (const v of variants) {
      for (const k of Object.keys(v.derived_parameters)) allKeys.add(k)
    }
    const derived: DerivedParameters = {}
    for (const k of allKeys) {
      const numeric: number[] = []
      const stringVals: string[] = []
      for (const v of variants) {
        const val = v.derived_parameters[k]
        if (typeof val === 'number') numeric.push(val)
        else if (typeof val === 'string') stringVals.push(val)
      }
      if (numeric.length > 0) {
        const m = median(numeric)
        if (m !== null) derived[k] = m
      } else if (stringVals.length > 0) {
        const modal = modalString(stringVals)
        if (modal !== null) derived[k] = modal
      }
    }

    // allowed_radicals: union, drop singletons if checker NEEDS_MAJOR
    const radicalCounts = new Map<string, number>()
    for (const v of variants) {
      for (const r of v.allowed_radicals) {
        radicalCounts.set(r, (radicalCounts.get(r) ?? 0) + 1)
      }
    }
    const allowedRadicals: string[] = []
    for (const [r, c] of radicalCounts) {
      if (c === 1 && checker.verdict === 'NEEDS_MAJOR') {
        disagreements.push(
          `Tier 2: module "${mod}" allowed_radical "${r}" listed by only 1 emitter and checker NEEDS_MAJOR; dropped`,
        )
        continue
      }
      allowedRadicals.push(r)
    }

    // applicability_confidence: median (rank ordering)
    const confRank: Record<ApplicabilityConfidence, number> = { low: 0, medium: 1, high: 2 }
    const confValues = variants.map(v => confRank[v.applicability_confidence] ?? 0)
    const medConf = median(confValues)
    let appConf: ApplicabilityConfidence = 'low'
    if (medConf !== null) {
      const rounded = Math.round(medConf)
      appConf = rounded >= 2 ? 'high' : rounded >= 1 ? 'medium' : 'low'
    }

    // secondary_modules: union
    const secSet = new Set<UniversalModule>()
    for (const v of variants) {
      for (const s of v.secondary_modules ?? []) secSet.add(s)
    }
    const secondary = secSet.size > 0 ? Array.from(secSet) : undefined

    includedModules.push({
      module: mod,
      module_brief: bestBrief,
      derived_parameters: derived,
      allowed_radicals: allowedRadicals,
      applicability_confidence: appConf,
      secondary_modules: secondary,
    })
  }

  const confidence = inferConfidence(lists.length, 3, checker.verdict)
  return {
    synthesised: includedModules,
    confidence,
    disagreements,
    checkerHonoured,
  }
}

// ---------------------------------------------------------------------------
// Tier 3 synthesis — sub-module decomposition (one module)
// ---------------------------------------------------------------------------

/**
 * Synthesise 3 emitter SubModuleBrief[] outputs into a single canonical list.
 *
 * Rules (per memo §7 Tier 3 — UNION, not majority):
 *   - A sub-module is real if ANY emitter lists it. Sub-module recall is more
 *     valuable than precision; downstream Tier 4 will filter empty ones.
 *   - For each id:
 *       sub_module_brief = longest emission
 *       grammar_links_out = union (mechanism normalised)
 *       role_verb / topology_clause / name_human = longest emission
 *
 * Determinism: when emitters disagree on id name (e.g. `cell_string` vs
 * `cell_array`), the alphabetically-first id wins. Disagreement is logged.
 */
export function synthesiseTier3SubModules(
  emitters: TierEmitterOutput<SubModuleBrief[]>[],
  checker: TierCheckerOutput,
): SynthesisResult<SubModuleBrief[]> {
  const lists = countableEmitters(emitters)
  const disagreements: string[] = []

  if (lists.length === 0) {
    return {
      synthesised: [],
      confidence: 'low',
      disagreements: ['Tier 3: no emitter produced a parseable SubModuleBrief[] list'],
      checkerHonoured: false,
    }
  }

  const flat: SubModuleBrief[] = lists.flat()
  const byId = new Map<string, SubModuleBrief[]>()
  for (const sb of flat) {
    const arr = byId.get(sb.id) ?? []
    arr.push(sb)
    byId.set(sb.id, arr)
  }

  const checkerHonoured = checkerOverridesMajority(checker, 2)

  // Sort ids alphabetically for determinism
  const sortedIds = Array.from(byId.keys()).sort()
  const synthesised: SubModuleBrief[] = []
  for (const id of sortedIds) {
    const variants = byId.get(id)!

    if (variants.length < lists.length) {
      disagreements.push(
        `Tier 3: sub-module "${id}" emitted by ${variants.length}/${lists.length} emitters (union: kept)`,
      )
    }

    // Pick the variant with the longest brief
    let pick = variants[0]
    for (const v of variants) {
      if (v.sub_module_brief.length > pick.sub_module_brief.length) pick = v
    }

    // Longest name_human
    let bestName = variants[0].name_human
    for (const v of variants) {
      if (v.name_human.length > bestName.length) bestName = v.name_human
    }

    // role_verb / topology_clause: longest non-empty
    let roleVerb: string | undefined
    let topology: string | undefined
    for (const v of variants) {
      if (v.role_verb && (!roleVerb || v.role_verb.length > roleVerb.length)) {
        roleVerb = v.role_verb
      }
      if (v.topology_clause && (!topology || v.topology_clause.length > topology.length)) {
        topology = v.topology_clause
      }
    }

    // Union of grammar_links_out (key by from→to+mechanism)
    const linkSeen = new Set<string>()
    const linksOut: GrammarLink[] = []
    for (const v of variants) {
      for (const gl of v.grammar_links_out) {
        const key = `${gl.from_sub_module}::${gl.to_sub_module}::${gl.mechanism}::${gl.type}`
        if (!linkSeen.has(key)) {
          linkSeen.add(key)
          linksOut.push(gl)
        }
      }
    }

    synthesised.push({
      id,
      name_human: bestName,
      sub_module_brief: pick.sub_module_brief,
      role_verb: roleVerb,
      topology_clause: topology,
      grammar_links_out: linksOut,
    })
  }

  const confidence = inferConfidence(lists.length, lists.length === 3 ? 3 : 2, checker.verdict)
  return {
    synthesised,
    confidence,
    disagreements,
    checkerHonoured,
  }
}

// ---------------------------------------------------------------------------
// Tier 4 synthesis — parts + RAD + grammar (one sub-module)
// ---------------------------------------------------------------------------

const QUANTITY_KIND = 'quantity'

/**
 * Detect whether a word is a singleton-by-design — i.e. legitimately has
 * no quantity modifier (enclosures, single-chassis components, the parent
 * module's principal vessel). Used by R-C2 to skip the missing-quantity flag.
 *
 * Heuristics (memo §8):
 *   - Sub-module role_verb of `contains_one` / `contains` / `houses`
 *   - Word has no quantity-style hint anywhere in its modifier_characters
 *     AND character_id ends in `_enclosure` / `_chassis` / `_housing` / `_vessel`
 *     / `_frame` (single big-mechanical structural parts)
 *
 * Caller passes `subModuleRoleVerb` from the parent SubModuleBrief.
 */
function isSingletonWord(word: WordSpec, subModuleRoleVerb?: string): boolean {
  if (subModuleRoleVerb) {
    const rv = subModuleRoleVerb.toLowerCase()
    if (rv === 'contains_one' || rv === 'contains' || rv === 'houses') return true
  }
  const charId = word.content_character?.character_id?.toLowerCase() ?? ''
  const singletonSuffixes = ['_enclosure', '_chassis', '_housing', '_vessel', '_frame', '_shell']
  for (const sfx of singletonSuffixes) {
    if (charId.endsWith(sfx)) return true
  }
  return false
}

/**
 * R-C2: extract quantity modifier value with ≥2-of-3 agreement requirement.
 *
 * Returns:
 *   { value: number, agreement: 'unanimous' | 'majority' | 'minority' | 'missing' }
 *
 * `unanimous` = 3/3 agree, `majority` = 2/3 agree on a value, `minority` =
 * 1/3 only one emitter has a value (downgrade confidence). `missing` = no
 * emitter provided a quantity.
 */
function synthesiseQuantityModifier(
  variants: WordSpec[],
): {
  multiplicity: number | null
  agreement: 'unanimous' | 'majority' | 'minority' | 'missing'
  rawValues: string[]
} {
  const rawValues: string[] = []
  for (const w of variants) {
    const q = (w.modifier_characters ?? []).find(m => m.kind === QUANTITY_KIND)
    if (q && typeof q.value === 'string' && q.value.trim().length > 0) {
      rawValues.push(q.value.trim())
    }
  }
  if (rawValues.length === 0) {
    return { multiplicity: null, agreement: 'missing', rawValues }
  }
  // Parse numeric values out — strip leading × or x
  const numeric: number[] = []
  for (const v of rawValues) {
    const stripped = v.replace(/^[×x]\s*/i, '').replace(/[,\s]/g, '')
    const n = Number(stripped)
    if (Number.isFinite(n) && n > 0) numeric.push(n)
  }
  if (numeric.length === 0) {
    return { multiplicity: null, agreement: 'missing', rawValues }
  }
  // Count agreement
  const counts = new Map<number, number>()
  for (const n of numeric) counts.set(n, (counts.get(n) ?? 0) + 1)
  let best = numeric[0]
  let bestCount = 0
  for (const [n, c] of counts) {
    if (c > bestCount) {
      best = n
      bestCount = c
    }
  }
  if (bestCount >= 3) return { multiplicity: best, agreement: 'unanimous', rawValues }
  if (bestCount >= 2) return { multiplicity: best, agreement: 'majority', rawValues }
  // Only 1 emitter → use highest-confidence single value (the only one we have)
  return { multiplicity: numeric[0], agreement: 'minority', rawValues }
}

function mergeContentCharacter(variants: ContentCharacter[]): ContentCharacter {
  // Pick the variant with the most non-null radical slots; tiebreak by
  // longest name_human.
  let pick = variants[0]
  let pickScore = -1
  for (const v of variants) {
    const slots = [
      v.function_radical_primary,
      v.function_radical_secondary,
      v.material_radical_primary,
      v.material_radical_secondary,
    ].filter(s => s != null).length
    const score = slots * 100 + (v.name_human?.length ?? 0)
    if (score > pickScore) {
      pick = v
      pickScore = score
    }
  }
  return pick
}

/**
 * Synthesise N emitter PartsRadEmission outputs for ONE sub-module into a
 * single canonical PartsRadEmission.
 *
 * Rules (per memo §7 Tier 4):
 *   - words list = majority vote by content_character.character_id (≥2 of 3)
 *   - per-word quantity = R-C2 (≥2/3 agreement OR missing flag)
 *   - other modifiers (cap, form, dim, life, reg) = union with median-on-numeric
 *   - english_sentence = longest emission
 *   - rad_syntax       = longest emission (verbatim)
 *   - grammar_links    = union
 *   - cross_module_grammar_links = union
 */
export function synthesiseTier4PartsRad(
  emitters: TierEmitterOutput<PartsRadEmission>[],
  checker: TierCheckerOutput,
  /** Sub-module brief carrying role_verb hint for singleton detection. */
  subModuleBrief: SubModuleBrief,
): SynthesisResult<PartsRadEmission | null> {
  const lists = countableEmitters(emitters)
  const disagreements: string[] = []

  if (lists.length === 0) {
    return {
      synthesised: null,
      confidence: 'low',
      disagreements: [
        `Tier 4: no emitter produced a parseable PartsRadEmission for sub-module "${subModuleBrief.id}"`,
      ],
      checkerHonoured: false,
    }
  }

  // Header fields — module / sub_module_id should be identical across emitters
  const head = lists[0]

  // english_sentence + rad_syntax: longest
  let bestEnglish = head.english_sentence ?? ''
  let bestRad = head.rad_syntax ?? ''
  for (const e of lists) {
    if ((e.english_sentence ?? '').length > bestEnglish.length) bestEnglish = e.english_sentence
    if ((e.rad_syntax ?? '').length > bestRad.length) bestRad = e.rad_syntax
  }

  // words: majority vote by character_id
  const wordsFlat: WordSpec[] = lists.flatMap(e => e.words ?? [])
  const byCharId = new Map<string, WordSpec[]>()
  for (const w of wordsFlat) {
    const cid = w.content_character?.character_id
    if (!cid) continue
    const arr = byCharId.get(cid) ?? []
    arr.push(w)
    byCharId.set(cid, arr)
  }

  const checkerHonoured = checkerOverridesMajority(checker, 2)
  const synthesisedWords: WordSpec[] = []
  for (const [cid, variants] of byCharId) {
    if (variants.length < 2) {
      disagreements.push(
        `Tier 4: word "${cid}" emitted by only ${variants.length}/${lists.length} emitters; dropped (majority needs ≥2)`,
      )
      continue
    }

    // R-C2: quantity-modifier synthesis
    const qty = synthesiseQuantityModifier(variants)

    // Build merged modifier list
    // - quantity: from synthesiseQuantityModifier (or null if missing)
    // - other kinds: union, numeric median on conflict
    const mergedModifiers: ModifyingCharacter[] = []
    const isSingleton = isSingletonWord(variants[0], subModuleBrief.role_verb)

    if (qty.multiplicity !== null) {
      const unit = (() => {
        for (const w of variants) {
          const q = (w.modifier_characters ?? []).find(m => m.kind === QUANTITY_KIND)
          if (q?.unit) return q.unit
        }
        return undefined
      })()
      mergedModifiers.push({
        kind: QUANTITY_KIND,
        value: `×${qty.multiplicity}`,
        unit,
      })
      if (qty.agreement === 'minority') {
        disagreements.push(
          `Tier 4: word "${cid}" quantity ×${qty.multiplicity} emitted by only 1/3 emitters; kept with low confidence (R-C2)`,
        )
      } else if (qty.rawValues.length > 1 && new Set(qty.rawValues).size > 1) {
        disagreements.push(
          `Tier 4: word "${cid}" quantity disagreement among emitters: ${qty.rawValues.join(', ')}; chose ${qty.multiplicity}`,
        )
      }
    } else if (!isSingleton) {
      // R-C2: missing quantity AND not a singleton → log + emit no quantity
      // modifier. The downstream assembler / leafRecord builder uses
      // multiplicity=null + verification_status='missing-quantity'.
      disagreements.push(
        `Tier 4: word "${cid}" missing quantity modifier (R-C2 verification_status=missing-quantity)`,
      )
    }

    // Other modifier kinds: union dedup by (kind, value)
    const otherSeen = new Set<string>()
    for (const w of variants) {
      for (const m of w.modifier_characters ?? []) {
        if (m.kind === QUANTITY_KIND) continue
        const key = `${m.kind}::${m.value}::${m.unit ?? ''}`
        if (otherSeen.has(key)) continue
        otherSeen.add(key)
        mergedModifiers.push(m)
      }
    }

    // Merge content_character (take richest radical set)
    const contentChar = mergeContentCharacter(
      variants.map(v => v.content_character).filter((c): c is ContentCharacter => !!c),
    )

    // word id / name_human: take from first emitter (deterministic by character_id sort)
    const sorted = [...variants].sort((a, b) => (a.id ?? '').localeCompare(b.id ?? ''))
    const pickHead = sorted[0]

    synthesisedWords.push({
      id: pickHead.id,
      name_human: pickHead.name_human,
      content_character: contentChar,
      modifier_characters: mergedModifiers,
    })
  }

  // grammar_links: union (Tier 4 mechanism-detail wins if conflict — caller
  // handles cross-tier merge with Tier 3 in the assembler)
  const glSeen = new Set<string>()
  const grammarLinks: GrammarLink[] = []
  for (const e of lists) {
    for (const gl of e.grammar_links ?? []) {
      const key = `${gl.from_sub_module}::${gl.to_sub_module}::${gl.mechanism}::${gl.type}`
      if (!glSeen.has(key)) {
        glSeen.add(key)
        grammarLinks.push(gl)
      }
    }
  }

  // cross_module_grammar_links: union
  const xmSeen = new Set<string>()
  const crossLinks: CrossModuleGrammarLink[] = []
  for (const e of lists) {
    for (const cl of e.cross_module_grammar_links ?? []) {
      const key = `${cl.from_module}::${cl.to_module}::${cl.mechanism}::${cl.type}`
      if (!xmSeen.has(key)) {
        xmSeen.add(key)
        crossLinks.push(cl)
      }
    }
  }

  // council aggregate — combine seat reviews from emitters + checker
  const allSeats = lists.flatMap(e => e.council_seats ?? [])
  const allNotes = unionStrings([
    ...lists.map(e => e.council_notes ?? []),
    checker.notes ?? [],
    disagreements,
  ])

  // verdict aggregate: worst across input verdicts + checker
  const verdictRank: Record<string, number> = { OK: 0, NEEDS_MINOR: 1, NEEDS_MAJOR: 2 }
  let worstRank = 0
  for (const e of lists) {
    const r = verdictRank[e.council_verdict ?? 'OK'] ?? 0
    if (r > worstRank) worstRank = r
  }
  const checkerRank = verdictRank[checker.verdict] ?? 0
  if (checkerRank > worstRank) worstRank = checkerRank
  const aggregateVerdict = worstRank >= 2 ? 'NEEDS_MAJOR' : worstRank >= 1 ? 'NEEDS_MINOR' : 'OK'

  const synthesised: PartsRadEmission = {
    module: head.module,
    sub_module_id: head.sub_module_id,
    english_sentence: bestEnglish,
    rad_syntax: bestRad,
    words: synthesisedWords,
    grammar_links: grammarLinks,
    cross_module_grammar_links: crossLinks,
    council_verdict: aggregateVerdict,
    council_seats: allSeats,
    council_notes: allNotes,
    telemetry: {
      llm_call_ms: 0,
      council_ms: 0,
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost_gbp: 0,
      retried: false,
    },
  }

  const confidence = inferConfidence(lists.length, 3, checker.verdict)
  return { synthesised, confidence, disagreements, checkerHonoured }
}

// ---------------------------------------------------------------------------
// Generic helper (memo §7 prototype signature)
// ---------------------------------------------------------------------------

/**
 * Generic synthesis helper — for callers that want field-level control
 * outside the per-tier rules above. Not used by the WS-A tier callers
 * directly (they use the concrete per-tier functions) but kept exported
 * to satisfy the memo §7 signature for future reuse.
 */
export function synthesiseTierEmissions<T extends Record<string, unknown>>(
  emissions: TierEmitterOutput<T>[],
  checker: TierCheckerOutput,
  options: {
    unionFields?: (keyof T)[]
    intersectionFields?: (keyof T)[]
    medianFields?: (keyof T)[]
    flagDisagreement?: (keyof T)[]
  },
): SynthesisResult<T | null> {
  const lists = countableEmitters(emissions)
  const disagreements: string[] = []
  if (lists.length === 0) {
    return {
      synthesised: null,
      confidence: 'low',
      disagreements: ['no emitter produced parseable output'],
      checkerHonoured: false,
    }
  }
  const checkerHonoured = checkerOverridesMajority(checker, 2)

  // Start with first emission as base; mutate per options
  const base: Record<string, unknown> = { ...lists[0] }

  for (const field of options.unionFields ?? []) {
    const allValues: unknown[] = []
    for (const e of lists) {
      const v = e[field] as unknown
      if (Array.isArray(v)) allValues.push(...v)
    }
    base[field as string] = Array.from(new Set(allValues))
  }
  for (const field of options.intersectionFields ?? []) {
    const arrays: unknown[][] = []
    for (const e of lists) {
      const v = e[field] as unknown
      if (Array.isArray(v)) arrays.push(v)
    }
    if (arrays.length === 0) {
      base[field as string] = []
      continue
    }
    const setHead = new Set<unknown>(arrays[0])
    for (const a of arrays.slice(1)) {
      const s = new Set<unknown>(a)
      for (const x of Array.from(setHead)) if (!s.has(x)) setHead.delete(x)
    }
    base[field as string] = Array.from(setHead)
  }
  for (const field of options.medianFields ?? []) {
    const values: number[] = []
    for (const e of lists) {
      const v = e[field] as unknown
      if (typeof v === 'number') values.push(v)
    }
    const m = median(values)
    if (m !== null) base[field as string] = m
  }
  for (const field of options.flagDisagreement ?? []) {
    const values = lists.map(e => JSON.stringify(e[field]))
    if (new Set(values).size > 1) {
      disagreements.push(`field "${String(field)}" disagrees: ${values.join(' | ')}`)
    }
  }

  return {
    synthesised: base as T,
    confidence: inferConfidence(lists.length, 3, checker.verdict),
    disagreements,
    checkerHonoured,
  }
}

// ---------------------------------------------------------------------------
// WS-A 2026-05-13 — Monolith multi-emitter consensus (6 emitters + 2 judges)
//
// Pattern inversion: instead of 1 emitter + 4 reviewers, run 6 diverse emitters
// in parallel and 2 independent judges over the SYNTHESISED output. The judges
// see the synthesised catalog, not the raw emissions. Feature-flagged by
// RADICAL_MULTI_EMITTER in the orchestrator (see stages/1.7-module-decomposition.ts).
//
// Council remediations preserved end-to-end:
//   R-C1 — english_sentence + rad_syntax on every SubModuleSpec flow through
//   R-C2 — quantity-modifier ≥3 of 6 agreement OR missing flag
//   R-C3 — judge schema violations override emitter majority; quality NEEDS_MAJOR
//          only triggers retry when BOTH judges agree
// ---------------------------------------------------------------------------

/**
 * The "decomposition payload" each emitter is expected to produce — a strict
 * subset of `ModuleDecomposition` carrying just the synthesisable structural
 * fields. Telemetry, council_verdict, council_seats are aggregated by the
 * orchestrator wrapping this synthesiser.
 */
export interface MultiEmitterDecompositionPayload {
  product_class: string
  modules: ModuleSpec[]
  excluded_modules: UniversalModule[]
  rationale_excluded: Partial<Record<UniversalModule, string>>
  cross_module_grammar_links: CrossModuleGrammarLink[]
}

export interface MultiEmitterOutput {
  ok: boolean
  data?: MultiEmitterDecompositionPayload
  /** The model id (e.g. 'google/gemini-3.1-pro-preview'). */
  model: string
  /** Schema-grade violations the parser captured (kept for judge tiebreak). */
  schemaViolations?: string[]
}

export interface JudgeVerdict {
  /** Stable judge identifier (e.g. 'glm', 'sonnet'). */
  judge: string
  /** The model id. */
  model: string
  verdict: 'OK' | 'NEEDS_MINOR' | 'NEEDS_MAJOR'
  notes: string[]
  /**
   * R-C3: schema violations cited by the judge against the synthesised
   * output (invalid radical_id, duplicate sub_module id, malformed RAD).
   * When non-empty, the synthesiser drops the offending field rather than
   * triggering a retry; pure quality NEEDS_MAJOR (no schema violations)
   * triggers retry only when BOTH judges agree.
   */
  schemaViolations?: string[]
}

export interface MultiEmitterSynthesisResult {
  synthesised: MultiEmitterDecompositionPayload
  /**
   * Per-emitter and per-judge seat reviews, normalised into the existing
   * CouncilSeatReview shape so downstream telemetry doesn't need a new contract.
   * 6 emitter seats + 2 judge seats = 8 entries (failed emitters surface as
   * transport_failed=true).
   */
  seats: CouncilSeatReview[]
  /** Aggregate verdict per WS-A tiebreak rule (see below). */
  verdict: CouncilVerdict
  /** Disagreement / propagation notes for council_notes downstream. */
  notes: string[]
  /**
   * True when EITHER judge flagged a schema violation. The orchestrator must
   * surface this in council_notes and (per spec) "drop the offending field,
   * no retry needed".
   */
  schemaViolationFlagged: boolean
  /**
   * True when BOTH judges voted NEEDS_MAJOR on a QUALITY basis (no schema
   * violations). The orchestrator must retry the synthesis once with judge
   * notes appended to each emitter prompt.
   */
  shouldRetry: boolean
}

/**
 * Minimum number of speaking emitters required for synthesis to proceed.
 * Below this threshold the orchestrator must fall back (or fail the stage).
 * Set to 3 — matches the inclusion-majority threshold.
 */
const MIN_SPEAKING_EMITTERS = 3

/**
 * Module inclusion threshold (per spec): a module appears in the synthesised
 * catalog if ≥3 of 6 emitters list it. The threshold scales with the speaking
 * emitter count so that if e.g. 4 emitters speak, the threshold becomes
 * ceil(3 × 4/6) = 2.
 */
function moduleInclusionThreshold(speakingEmitters: number): number {
  if (speakingEmitters >= 6) return 3
  if (speakingEmitters >= 4) return 2
  return Math.min(2, speakingEmitters) // 3 speaking → 2; 2 → 2
}

/**
 * Excluded inclusion threshold (per spec): only excluded if ≥4 of 6 emitters
 * emit it as excluded — high bar to avoid losing modules that are arguably
 * present.
 */
function excludedInclusionThreshold(speakingEmitters: number): number {
  if (speakingEmitters >= 6) return 4
  if (speakingEmitters >= 4) return 3
  return Math.min(2, speakingEmitters)
}

/**
 * Word-inclusion threshold across emitter sub-modules per spec:
 * "Words per sub-module: majority vote by character_id (≥3 of 6 emitters must emit it)."
 */
function wordInclusionThreshold(speakingEmitters: number): number {
  return moduleInclusionThreshold(speakingEmitters)
}

/**
 * Quantity-modifier agreement threshold (R-C2):
 * "≥3 of 6 emitters to agree on value. If <3 agree, use modal value with
 *  confidence: 'low' OR emit verification_status: 'missing-quantity'".
 */
function quantityAgreementThreshold(speakingEmitters: number): number {
  return moduleInclusionThreshold(speakingEmitters)
}

/**
 * Merge per-sub-module words from N emitter ModuleSpec variants into the
 * synthesised SubModuleSpec.words[] per R-C2 + spec word-inclusion rules.
 *
 * Returns a single SubModuleSpec with merged words, R-C2 quantity handling,
 * union modifiers, and (R-C1) propagated english_sentence + rad_syntax
 * (longest emission wins).
 */
function synthesiseSubModule(
  subId: string,
  variants: SubModuleSpec[],
  speakingEmitters: number,
  notes: string[],
): SubModuleSpec | null {
  if (variants.length === 0) return null

  // name_human: longest emission
  let bestName = variants[0].name_human
  for (const v of variants) {
    if ((v.name_human ?? '').length > bestName.length) bestName = v.name_human
  }

  // role_verb / topology_clause: longest non-empty
  let roleVerb: string | undefined
  let topology: string | undefined
  for (const v of variants) {
    if (v.role_verb && (!roleVerb || v.role_verb.length > roleVerb.length)) roleVerb = v.role_verb
    if (v.topology_clause && (!topology || v.topology_clause.length > topology.length)) {
      topology = v.topology_clause
    }
  }

  // R-C1: english_sentence + rad_syntax — longest emission wins
  let bestEnglish: string | undefined
  let bestRad: string | undefined
  for (const v of variants) {
    if (typeof v.english_sentence === 'string' && v.english_sentence.trim().length > 0) {
      if (!bestEnglish || v.english_sentence.length > bestEnglish.length) {
        bestEnglish = v.english_sentence
      }
    }
    if (typeof v.rad_syntax === 'string' && v.rad_syntax.trim().length > 0) {
      if (!bestRad || v.rad_syntax.length > bestRad.length) {
        bestRad = v.rad_syntax
      }
    }
  }

  // Word majority vote by content_character.character_id
  const wordsFlat: { word: WordSpec; emitterIdx: number }[] = []
  variants.forEach((v, idx) => {
    for (const w of v.words ?? []) {
      if (w.content_character?.character_id) {
        wordsFlat.push({ word: w, emitterIdx: idx })
      }
    }
  })
  const byCid = new Map<string, WordSpec[]>()
  for (const { word } of wordsFlat) {
    const cid = word.content_character.character_id
    const arr = byCid.get(cid) ?? []
    arr.push(word)
    byCid.set(cid, arr)
  }

  const wordThresh = wordInclusionThreshold(speakingEmitters)
  const qtyThresh = quantityAgreementThreshold(speakingEmitters)
  const synthesisedWords: WordSpec[] = []
  for (const [cid, wVariants] of byCid) {
    if (wVariants.length < wordThresh) {
      notes.push(
        `[multi-emitter] sub-module "${subId}" word "${cid}" emitted by ${wVariants.length}/${speakingEmitters} (threshold ${wordThresh}); dropped`,
      )
      continue
    }

    // Quantity modifier — R-C2 strict
    const qty = synthesiseQuantityModifierMulti(wVariants, qtyThresh)
    const isSingleton = isSingletonWord(wVariants[0], roleVerb)

    const mergedMods: ModifyingCharacter[] = []
    if (qty.multiplicity !== null) {
      const unit = (() => {
        for (const w of wVariants) {
          const q = (w.modifier_characters ?? []).find(m => m.kind === QUANTITY_KIND)
          if (q?.unit) return q.unit
        }
        return undefined
      })()
      mergedMods.push({ kind: QUANTITY_KIND, value: `×${qty.multiplicity}`, unit })
      if (qty.agreement === 'minority') {
        notes.push(
          `[multi-emitter] word "${cid}" quantity ×${qty.multiplicity} agreed by <${qtyThresh} emitters; kept with confidence=low (R-C2 modal-fallback)`,
        )
      } else if (qty.rawValues.length > 1 && new Set(qty.rawValues).size > 1) {
        notes.push(
          `[multi-emitter] word "${cid}" quantity disagreement: ${qty.rawValues.join(', ')}; chose ${qty.multiplicity}`,
        )
      }
    } else if (!isSingleton) {
      // R-C2: missing quantity + not a singleton — log + no quantity modifier
      notes.push(
        `[multi-emitter] word "${cid}" missing quantity modifier on non-singleton word (R-C2 verification_status=missing-quantity)`,
      )
    }

    // Other modifiers: union with median-on-numeric-conflict
    const otherByKind = new Map<string, ModifyingCharacter[]>()
    for (const w of wVariants) {
      for (const m of w.modifier_characters ?? []) {
        if (m.kind === QUANTITY_KIND) continue
        const arr = otherByKind.get(m.kind as string) ?? []
        arr.push(m)
        otherByKind.set(m.kind as string, arr)
      }
    }
    for (const [kind, mods] of otherByKind) {
      // Try numeric median first
      const numeric = mods
        .map(m => Number(String(m.value).replace(/[×x,\s]/gi, '')))
        .filter(n => Number.isFinite(n))
      if (numeric.length >= 2 && new Set(numeric).size > 1) {
        const med = median(numeric)
        if (med !== null) {
          const unit = mods.find(m => m.unit)?.unit
          mergedMods.push({ kind, value: String(med), unit })
          continue
        }
      }
      // Else union-dedup by (value, unit)
      const seen = new Set<string>()
      for (const m of mods) {
        const key = `${m.value}::${m.unit ?? ''}`
        if (seen.has(key)) continue
        seen.add(key)
        mergedMods.push(m)
      }
    }

    // Content character: richest radical set wins
    const contentChar = mergeContentCharacter(
      wVariants.map(v => v.content_character).filter((c): c is ContentCharacter => !!c),
    )

    // word id / name_human: take from first variant after deterministic sort
    const sortedV = [...wVariants].sort((a, b) => (a.id ?? '').localeCompare(b.id ?? ''))
    synthesisedWords.push({
      id: sortedV[0].id,
      name_human: sortedV[0].name_human,
      content_character: contentChar,
      modifier_characters: mergedMods,
    })
  }

  return {
    id: subId,
    name_human: bestName,
    words: synthesisedWords,
    role_verb: roleVerb,
    topology_clause: topology,
    english_sentence: bestEnglish,
    rad_syntax: bestRad,
  }
}

/**
 * R-C2 multi-emitter version of synthesiseQuantityModifier — generalised
 * agreement threshold (≥3 of N emitters) for the 6-emitter monolith pattern.
 */
function synthesiseQuantityModifierMulti(
  variants: WordSpec[],
  threshold: number,
): {
  multiplicity: number | null
  agreement: 'unanimous' | 'majority' | 'minority' | 'missing'
  rawValues: string[]
} {
  const rawValues: string[] = []
  for (const w of variants) {
    const q = (w.modifier_characters ?? []).find(m => m.kind === QUANTITY_KIND)
    if (q && typeof q.value === 'string' && q.value.trim().length > 0) {
      rawValues.push(q.value.trim())
    }
  }
  if (rawValues.length === 0) {
    return { multiplicity: null, agreement: 'missing', rawValues }
  }
  const numeric: number[] = []
  for (const v of rawValues) {
    const stripped = v.replace(/^[×x]\s*/i, '').replace(/[,\s]/g, '')
    const n = Number(stripped)
    if (Number.isFinite(n) && n > 0) numeric.push(n)
  }
  if (numeric.length === 0) {
    return { multiplicity: null, agreement: 'missing', rawValues }
  }
  const counts = new Map<number, number>()
  for (const n of numeric) counts.set(n, (counts.get(n) ?? 0) + 1)
  let best = numeric[0]
  let bestCount = 0
  for (const [n, c] of counts) {
    if (c > bestCount) {
      best = n
      bestCount = c
    }
  }
  if (bestCount >= variants.length) return { multiplicity: best, agreement: 'unanimous', rawValues }
  if (bestCount >= threshold) return { multiplicity: best, agreement: 'majority', rawValues }
  return { multiplicity: best, agreement: 'minority', rawValues }
}

/**
 * Synthesise a single ModuleSpec from N emitter variants. All variants share
 * the same `module` key (matched by majority vote upstream).
 */
function synthesiseModule(
  moduleKey: UniversalModule,
  variants: ModuleSpec[],
  speakingEmitters: number,
  notes: string[],
): ModuleSpec {
  // module_brief: longest
  let bestBrief = variants[0].module_brief
  for (const v of variants) {
    if (v.module_brief.length > bestBrief.length) bestBrief = v.module_brief
  }

  // derived_parameters: numeric median, string modal
  const allKeys = new Set<string>()
  for (const v of variants) {
    for (const k of Object.keys(v.derived_parameters ?? {})) allKeys.add(k)
  }
  const derived: DerivedParameters = {}
  for (const k of allKeys) {
    const numeric: number[] = []
    const stringVals: string[] = []
    for (const v of variants) {
      const val = v.derived_parameters?.[k]
      if (typeof val === 'number') numeric.push(val)
      else if (typeof val === 'string') stringVals.push(val)
    }
    if (numeric.length > 0) {
      const m = median(numeric)
      if (m !== null) derived[k] = m
    } else if (stringVals.length > 0) {
      const modal = modalString(stringVals)
      if (modal !== null) derived[k] = modal
    }
  }

  // allowed_radicals: union
  const radicalSet = new Set<string>()
  for (const v of variants) {
    for (const r of v.allowed_radicals ?? []) radicalSet.add(r)
  }

  // applicability_confidence: median rank
  const confRank: Record<ApplicabilityConfidence, number> = { low: 0, medium: 1, high: 2 }
  const confValues = variants.map(v => confRank[v.applicability_confidence] ?? 0)
  const medConf = median(confValues)
  let appConf: ApplicabilityConfidence = 'low'
  if (medConf !== null) {
    const rounded = Math.round(medConf)
    appConf = rounded >= 2 ? 'high' : rounded >= 1 ? 'medium' : 'low'
  }

  // secondary_modules: union
  const secSet = new Set<UniversalModule>()
  for (const v of variants) {
    for (const s of v.secondary_modules ?? []) secSet.add(s)
  }
  const secondary = secSet.size > 0 ? Array.from(secSet) : undefined

  // sub_modules: union by id (any emitter contributes)
  const subById = new Map<string, SubModuleSpec[]>()
  for (const v of variants) {
    for (const sm of v.sub_modules ?? []) {
      const arr = subById.get(sm.id) ?? []
      arr.push(sm)
      subById.set(sm.id, arr)
    }
  }
  const subModules: SubModuleSpec[] = []
  for (const [subId, smVariants] of subById) {
    const merged = synthesiseSubModule(subId, smVariants, speakingEmitters, notes)
    if (merged) subModules.push(merged)
  }

  // grammar_links: union, dedupe by (from, to, mechanism)
  const glSeen = new Set<string>()
  const grammarLinks: GrammarLink[] = []
  for (const v of variants) {
    for (const gl of v.grammar_links ?? []) {
      const key = `${gl.from_sub_module}::${gl.to_sub_module}::${gl.mechanism}::${gl.type}`
      if (glSeen.has(key)) continue
      glSeen.add(key)
      grammarLinks.push(gl)
    }
  }

  return {
    module: moduleKey,
    module_brief: bestBrief,
    derived_parameters: derived,
    allowed_radicals: Array.from(radicalSet),
    applicability_confidence: appConf,
    secondary_modules: secondary,
    sub_modules: subModules,
    grammar_links: grammarLinks,
  }
}

/**
 * Top-level monolith multi-emitter synthesiser.
 *
 * INPUTS:
 *   - emitters: 6 emitter outputs, each a full MultiEmitterDecompositionPayload.
 *               Failed emissions are passed in with ok=false and treated as
 *               ABSTAIN — they do not count toward inclusion thresholds.
 *   - judges:   2 judge verdicts over the SYNTHESISED output (not raw emissions).
 *               The synthesiser is called TWICE in the orchestrator: once for
 *               the initial synthesis (which judges then review), and again on
 *               retry if both judges flagged quality NEEDS_MAJOR.
 *
 * TIEBREAK RULE (per WS-A spec):
 *   - Either judge flagging a schema violation → drop the offending field
 *     (synthesiser sets schemaViolationFlagged=true; orchestrator handles
 *     field drop. No retry needed.)
 *   - Both judges agreeing on NEEDS_MAJOR (quality, no schema violations) →
 *     synthesiser sets shouldRetry=true; orchestrator retries ONCE with
 *     judge notes appended to each emitter prompt.
 *   - Only one judge NEEDS_MAJOR (quality) → log in notes, proceed.
 *
 * NOTE: judges may be passed in EMPTY ([]) on the FIRST synthesis pass —
 * they get called AFTER synthesis. Pass empty judges for first synthesis,
 * then re-invoke with judges populated to compute verdict.
 */
export function synthesiseMultiEmitterDecomposition(
  emitters: MultiEmitterOutput[],
  judges: JudgeVerdict[],
): MultiEmitterSynthesisResult {
  const speaking = emitters.filter(e => e.ok && e.data)
  const speakingPayloads = speaking.map(e => e.data!)
  const speakingCount = speakingPayloads.length
  const notes: string[] = []

  // Map each emitter to a CouncilSeatReview (for telemetry compatibility)
  const emitterSeats: CouncilSeatReview[] = emitters.map((e, idx) => {
    const seatId = mapModelToSeatId(e.model, idx)
    return {
      seat: seatId,
      verdict: e.ok ? 'OK' : 'NEEDS_MAJOR',
      coverage_ok: e.ok,
      no_spurious_modules: e.ok,
      parameters_plausible: e.ok,
      notes: e.ok ? [] : [`emitter ${e.model} failed at transport`],
      transport_failed: !e.ok,
    }
  })

  // Judge seats
  const judgeSeats: CouncilSeatReview[] = judges.map((j, idx) => ({
    seat: mapJudgeToSeatId(j.judge, idx),
    verdict: j.verdict,
    coverage_ok: j.verdict !== 'NEEDS_MAJOR',
    no_spurious_modules: j.verdict !== 'NEEDS_MAJOR',
    parameters_plausible: j.verdict !== 'NEEDS_MAJOR',
    notes: [...(j.notes ?? []), ...(j.schemaViolations ?? []).map(s => `[schema] ${s}`)],
  }))

  if (speakingCount < MIN_SPEAKING_EMITTERS) {
    notes.push(
      `[multi-emitter] only ${speakingCount}/6 emitters produced parseable output (minimum ${MIN_SPEAKING_EMITTERS}); synthesis degraded`,
    )
  }

  // Module-level inclusion: majority vote ≥3 of 6 (scaled to speaking count)
  const incThresh = moduleInclusionThreshold(speakingCount)
  const excThresh = excludedInclusionThreshold(speakingCount)

  const moduleVotes = new Map<UniversalModule, ModuleSpec[]>()
  for (const payload of speakingPayloads) {
    for (const m of payload.modules ?? []) {
      const arr = moduleVotes.get(m.module) ?? []
      arr.push(m)
      moduleVotes.set(m.module, arr)
    }
  }

  const includedModules: ModuleSpec[] = []
  const includedKeys = new Set<UniversalModule>()
  for (const [moduleKey, variants] of moduleVotes) {
    if (variants.length < incThresh) {
      notes.push(
        `[multi-emitter] module "${moduleKey}" emitted by ${variants.length}/${speakingCount} (threshold ${incThresh}); dropped`,
      )
      continue
    }
    includedModules.push(synthesiseModule(moduleKey, variants, speakingCount, notes))
    includedKeys.add(moduleKey)
  }

  // Excluded: intersection — only if ≥4 of 6 emitters emit it as excluded
  const excVotes = new Map<UniversalModule, number>()
  for (const payload of speakingPayloads) {
    for (const e of payload.excluded_modules ?? []) {
      excVotes.set(e, (excVotes.get(e) ?? 0) + 1)
    }
  }
  const excluded: UniversalModule[] = []
  for (const [m, c] of excVotes) {
    if (c >= excThresh && !includedKeys.has(m)) {
      excluded.push(m)
    } else if (c < excThresh && !includedKeys.has(m)) {
      notes.push(
        `[multi-emitter] module "${m}" emitted as excluded by only ${c}/${speakingCount} (threshold ${excThresh}); not added to excluded`,
      )
    }
  }

  // rationale_excluded: union of rationales for genuinely-excluded modules
  const rationale: Partial<Record<UniversalModule, string>> = {}
  for (const m of excluded) {
    for (const payload of speakingPayloads) {
      const r = payload.rationale_excluded?.[m]
      if (r && r.trim().length > 0) {
        // Take the longest rationale across emitters
        if (!rationale[m] || r.length > (rationale[m]?.length ?? 0)) {
          rationale[m] = r
        }
      }
    }
  }

  // cross_module_grammar_links: union, dedupe by (from, to, mechanism)
  const xmSeen = new Set<string>()
  const crossLinks: CrossModuleGrammarLink[] = []
  for (const payload of speakingPayloads) {
    for (const cl of payload.cross_module_grammar_links ?? []) {
      // Only keep cross-links whose endpoints are in the synthesised included set
      if (!includedKeys.has(cl.from_module) || !includedKeys.has(cl.to_module)) continue
      const key = `${cl.from_module}::${cl.to_module}::${cl.mechanism}::${cl.type}`
      if (xmSeen.has(key)) continue
      xmSeen.add(key)
      crossLinks.push(cl)
    }
  }

  // product_class: modal across emitters; tiebreak by first
  const classCounts = new Map<string, number>()
  for (const payload of speakingPayloads) {
    if (typeof payload.product_class === 'string' && payload.product_class.length > 0) {
      classCounts.set(payload.product_class, (classCounts.get(payload.product_class) ?? 0) + 1)
    }
  }
  let productClass = speakingPayloads[0]?.product_class ?? ''
  let bestClassCount = 0
  for (const [c, n] of classCounts) {
    if (n > bestClassCount) {
      productClass = c
      bestClassCount = n
    }
  }

  // Tiebreak verdict per WS-A rule
  const schemaViolationFlagged = judges.some(j => (j.schemaViolations?.length ?? 0) > 0)
  const judgesQualityMajor = judges.filter(
    j => j.verdict === 'NEEDS_MAJOR' && (j.schemaViolations?.length ?? 0) === 0,
  )
  const shouldRetry = judges.length >= 2 && judgesQualityMajor.length >= 2
  const judgesAnyMinor = judges.some(j => j.verdict === 'NEEDS_MINOR' || j.verdict === 'NEEDS_MAJOR')

  let verdict: CouncilVerdict
  if (judges.length === 0) {
    // No judges yet — synthesis-only pass. Verdict is provisional.
    verdict = speakingCount >= MIN_SPEAKING_EMITTERS ? 'OK' : 'NEEDS_MINOR'
  } else if (shouldRetry) {
    verdict = 'NEEDS_MAJOR'
  } else if (judgesAnyMinor || schemaViolationFlagged) {
    verdict = 'NEEDS_MINOR'
  } else {
    verdict = 'OK'
  }

  return {
    synthesised: {
      product_class: productClass,
      modules: includedModules,
      excluded_modules: excluded,
      rationale_excluded: rationale,
      cross_module_grammar_links: crossLinks,
    },
    seats: [...emitterSeats, ...judgeSeats],
    verdict,
    notes,
    schemaViolationFlagged,
    shouldRetry,
  }
}

/**
 * Heuristic mapping from model id to CouncilSeatId. The CouncilSeatId enum
 * has 4 slots; the multi-emitter pattern needs 8 (6 emitters + 2 judges).
 * Map common providers to canonical seat ids; fall back to indexed seat names.
 */
function mapModelToSeatId(model: string, idx: number): CouncilSeatId {
  const m = (model ?? '').toLowerCase()
  if (m.includes('grok')) return 'grok'
  if (m.includes('gemini')) return 'gemini'
  if (m.includes('glm') || m.includes('zhipu') || m.includes('z-ai')) return 'glm'
  if (m.includes('mimo') || m.includes('xiaomi')) return 'mimo'
  // Fall back — the 4-slot CouncilSeatId can't represent claude/qwen/kimi
  // directly. For multi-emitter, callers should switch to a wider seat type;
  // until then, map sequentially to the canonical 4 with a wrap.
  const fallback: CouncilSeatId[] = ['grok', 'gemini', 'glm', 'mimo']
  return fallback[idx % fallback.length]
}

function mapJudgeToSeatId(judge: string, idx: number): CouncilSeatId {
  const j = (judge ?? '').toLowerCase()
  if (j.includes('glm')) return 'glm'
  if (j.includes('grok')) return 'grok'
  if (j.includes('gemini')) return 'gemini'
  if (j.includes('mimo')) return 'mimo'
  // Sonnet judge has no canonical slot — map to gemini for telemetry parity
  // when idx hits that fallback. (Engine has no closer match.)
  const fallback: CouncilSeatId[] = ['glm', 'gemini', 'grok', 'mimo']
  return fallback[idx % fallback.length]
}
