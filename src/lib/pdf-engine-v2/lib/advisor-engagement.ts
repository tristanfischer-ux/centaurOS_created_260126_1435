/**
 * src/lib/pdf-engine-v2/lib/advisor-engagement.ts
 *
 * "Take this to your advisors" generator (2026-06-05). Tristan's brief: turn the
 * design into a design REVIEW the founder can actually run — for every module,
 * name the SPECIALIST they need (discipline / seniority / background + the kind
 * of company that fields that person), then the questions to ask, each GROUNDED
 * in a real open item the engine found on THIS run, plus what a strong answer
 * sounds like so a non-expert can judge the adviser in front of them.
 *
 * Architecture (mirrors feasibility-assessment.ts + sourcing-strategy.ts +
 * investor-section.ts — the in-chain LLM-narrative-section pattern):
 *
 *   1. DETERMINISTIC GROUNDING (the credibility spine). For each module instance
 *      we gather the module's OPEN ITEMS from data the chain already computed —
 *      every question must trace to one of these, nothing invented:
 *        • request-for-quotation / made-to-order / fabricated lines
 *          (costBasis.lines[].basis.rfq_recommended + method, partVerifications,
 *          and the word's `form` modifier "made to order" / "fabricated" / …)
 *        • physics-critic findings tagged to the module (physicsCritique.issues
 *          whose `where` = "<moduleId>/sub_modules[N]/words[M]" lands in THIS
 *          module instance's sub-module index range)
 *        • ±30% / estimate-class 4-5 cost lines for the module
 *        • key engineering assumptions + contract closures that warn, relevant
 *          to the module
 *        • unverified brief constraints (the "—" compliance rows) relevant to
 *          the module
 *
 *   2. LLM VOICE (the part that generalises to any class). The gathered items go
 *      to the Anthropic-FREE helper (callFastExtract → Gemini 3.1 Flash-Lite,
 *      Grok 4.3 fallback — the exact helper investor-section.ts uses), which
 *      turns each module's items into 1-3 SPECIALIST CARDS. DESIGN-ONLY: the
 *      prompt forbids any procurement / pricing / get-firm-prices content (that
 *      is deliberately out of scope per the user; the sourcing section handles
 *      it). NO acronyms in the rendered copy — the prompt instructs the model to
 *      spell every term out (monoethanolamine, not MEA).
 *
 * Stored as state.advisorEngagement[moduleKey] = AdvisorModuleBlock. moduleKey is
 * an INSTANCE key (`<moduleId>#<index>`) so duplicate taxonomy module ids (three
 * `mass_fluid_transport_process` process trains in the CO₂ plant) each get their
 * own block keyed to the instance the renderer is drawing.
 *
 * Fail-safe by construction: a module with no open items still gets a single
 * "confirm the design intent" card (or is skipped cleanly); any LLM / parse
 * failure for a module drops THAT module's block (the renderer no-ops) without
 * crashing the run. British spelling throughout.
 */

import { callFastExtract, GEMINI_3_1_FLASH_LITE, GROK_4_3 } from './openrouter-models'
import { isPhysicalRisk } from './feasibility-assessment'

// ── data shapes ───────────────────────────────────────────────────────────────

/** One specialist card for a module — the renderer draws this verbatim. */
export interface AdvisorCard {
  /** The discipline / job-title headline, e.g. "A chartered chemical / process engineer". */
  specialist_role: string
  /** Seniority + the exact hands-on background needed to answer well. */
  background: string
  /** The TYPE OF COMPANY that fields this person (never a named firm). */
  typically_at: string
  /** Which parts / sub-modules of the module this specialist owns. */
  covers: string
  /** 1-3 questions, each grounded in a real open item. */
  questions: AdvisorQuestion[]
}

export interface AdvisorQuestion {
  /** The sharp question to put to the specialist. */
  question: string
  /** The open item this traces to (what makes it credible, not invented). */
  grounded_in: string
  /** What a good answer sounds like (so a non-expert can judge the adviser). */
  strong_answer: string
}

export interface AdvisorModuleBlock {
  /** Instance key `<moduleId>#<index>` (handles duplicate taxonomy ids). */
  module_key: string
  /** Bare taxonomy module id. */
  module_id: string
  /** Human module name for the block heading. */
  module_name: string
  /** Short intro sentence the renderer puts under the block header. */
  intro: string
  cards: AdvisorCard[]
}

/** The whole map the chain writes to state.advisorEngagement. */
export type AdvisorEngagement = Record<string, AdvisorModuleBlock>

// ── an OPEN ITEM (the deterministic spine) ──────────────────────────────────────

type OpenItemKind = 'physics' | 'rfq' | 'made_to_order' | 'estimate_band' | 'assumption' | 'unverified_constraint'

interface OpenItem {
  kind: OpenItemKind
  /** Human one-liner describing the open item (what the question targets). */
  text: string
  /** The component / sub-module / aspect it sits on (for the LLM's `covers`). */
  subject: string
  /** A precise source trace string the LLM puts in `grounded_in`. */
  trace: string
  /** High-severity physics findings are the most important — surface first. */
  weight: number
}

// ── number / string helpers ─────────────────────────────────────────────────────

function num(x: any): number | null {
  const n = typeof x === 'number' ? x : Number(x)
  return Number.isFinite(n) ? n : null
}

function clip(s: string, n: number): string {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t
}

/**
 * Hard word-cap backstop for the advisor copy. The prompt instructs the model to
 * stay within these caps, but an over-long LLM response must not be able to
 * reintroduce the prose bloat that drops the dossier score — so we truncate every
 * card field at `maxWords`, preferring a SENTENCE BOUNDARY (full stop / question
 * mark) at or before the budget so the text reads as a complete thought rather
 * than a mid-clause cut. Falls back to a word-boundary cut with an ellipsis when
 * no sentence end sits in range. Whitespace-normalised; trailing list punctuation
 * tidied. Universal (no class assumptions). The mockup density is ≤18-word
 * questions / ≤22-word answers; these caps mirror that.
 */
function clipWords(s: string, maxWords: number): string {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  if (!t) return ''
  const words = t.split(' ')
  if (words.length <= maxWords) return t
  // Prefer the last sentence-ending word at/under the budget so the cut reads
  // as a finished sentence (the backstop should still look hand-written).
  const head = words.slice(0, maxWords).join(' ')
  const m = head.match(/^[\s\S]*[.!?](?=\s|$)/)
  if (m && m[0].trim().split(' ').length >= Math.ceil(maxWords * 0.6)) {
    return m[0].trim()
  }
  // No usable sentence boundary — cut at the word budget and signal the trim.
  return `${head.replace(/[\s,;:–—-]+$/, '').trimEnd()}…`
}

function humaniseModuleId(id: string): string {
  return String(id ?? '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

function humaniseWord(s: string): string {
  return expandAcronyms(String(s ?? '').replace(/_word$/, '').replace(/_/g, ' ').trim())
}

// No-acronym rule (Tristan, global): spell every term out in the rendered copy.
// The grounded_in / covers traces echo raw BoM labels + `form` modifiers that
// carry chemical formulae + standard abbreviations ("K2SO4 recrystalliser",
// "CO2 gas analyser", "SIL-rated", "ISO-corner"). The LLM prose is already
// spelled out; this expands the DETERMINISTIC trace substrings so no acronym
// leaks into the rendered grounded_in / subject. Universal: a curated map of the
// abbreviations that recur in chemical / process / electrical BoM labels. Word-
// boundary matched and case-sensitive on the formula tokens so we don't mangle
// ordinary words. Applied at humaniseWord (covers every label/word path).
const ACRONYM_EXPANSIONS: Array<[RegExp, string]> = [
  [/\bMEA\b/g, 'monoethanolamine'],
  [/\bCO2\b/g, 'carbon dioxide'],
  [/\bCO₂\b/g, 'carbon dioxide'],
  [/\bCaCO3\b/g, 'calcium carbonate'],
  [/\bCaCO₃\b/g, 'calcium carbonate'],
  [/\bK2SO4\b/g, 'potassium sulphate'],
  [/\bK₂SO₄\b/g, 'potassium sulphate'],
  [/\bKOH\b/g, 'potassium hydroxide'],
  [/\bNaOH\b/g, 'sodium hydroxide'],
  [/\bH2SO4\b/g, 'sulphuric acid'],
  [/\bVOC\b/g, 'volatile organic compound'],
  [/\bVSD\b/g, 'variable speed drive'],
  [/\bVFD\b/g, 'variable frequency drive'],
  [/\bSIL\b/g, 'safety integrity level'],
  [/\bISO-corner\b/g, 'standard shipping-container corner'],
  [/\bDSEAR\b/g, 'Dangerous Substances and Explosive Atmospheres'],
  [/\bPED\b/g, 'Pressure Equipment Directive'],
  [/\bATEX\b/g, 'explosive-atmospheres (ATEX)'],
  [/\bHMI\b/g, 'human-machine interface'],
  [/\bPLC\b/g, 'programmable logic controller'],
  [/\bRFQ\b/g, 'request for quotation'],
]

function expandAcronyms(s: string): string {
  let out = String(s ?? '')
  for (const [re, full] of ACRONYM_EXPANSIONS) out = out.replace(re, full)
  return out
}

/** The reader-facing module name: prefer the human display name, else humanise the id. */
function moduleName(mod: any): string {
  const human = String(mod?.module_human ?? mod?.display_name ?? '').trim()
  return human || humaniseModuleId(String(mod?.module ?? mod?.module_id ?? ''))
}

// ── word-id → module-instance index, and the form descriptor lookup ─────────────

/**
 * Build a map from word_id → the module INSTANCE index that owns it. Needed
 * because costBasis.lines + partVerifications key by the BARE taxonomy module id,
 * which repeats; the word_id is unique, so it resolves to the right instance.
 * When a word_id genuinely appears in two instances (rare) the FIRST wins — the
 * renderer resolves the same way (resolveModuleBom positional fallback).
 */
function buildWordIndex(modules: any[]): {
  wordToInstance: Map<string, number>
  formByWordId: Map<string, string>
} {
  const wordToInstance = new Map<string, number>()
  const formByWordId = new Map<string, string>()
  modules.forEach((mod, instanceIdx) => {
    for (const sm of (Array.isArray(mod?.sub_modules) ? mod.sub_modules : [])) {
      for (const w of (Array.isArray(sm?.words) ? sm.words : [])) {
        const wid = String(w?.id ?? w?.word_id ?? '').trim()
        if (!wid) continue
        if (!wordToInstance.has(wid)) wordToInstance.set(wid, instanceIdx)
        // The "made to order" / "fabricated" / "flanged segments" descriptor
        // lives in the word's `form` modifier.
        const mcs = Array.isArray(w?.modifier_characters) ? w.modifier_characters : []
        for (const mc of mcs) {
          if (String(mc?.kind ?? '').toLowerCase() === 'form') {
            // Expand acronyms at read-time so the descriptor never leaks an
            // abbreviation into the rendered grounded_in / covers copy.
            formByWordId.set(wid, expandAcronyms(String(mc?.value ?? mc?.text ?? '').trim()))
          }
        }
      }
    }
  })
  return { wordToInstance, formByWordId }
}

/**
 * Map each module instance to its [startSubIdx, endSubIdx) range within the FLAT
 * sub-module index space the physics-critic `where` path uses. The critic walks
 * each module's own sub_modules[] and emits `<moduleId>/sub_modules[N]` where N
 * is the index WITHIN that module — so for a given finding we match by module id
 * AND verify the sub-index is in range of one of the same-id instances. With
 * duplicate ids the finding's sub-index disambiguates the instance.
 */
function subModuleCount(mod: any): number {
  return Array.isArray(mod?.sub_modules) ? mod.sub_modules.length : 0
}

// ── descriptor classifiers (universal across classes) ───────────────────────────

const MADE_TO_ORDER_RE = /made[\s-]?to[\s-]?order|build[\s-]?to[\s-]?order|fabricat|bespoke|field[\s-]?erect|flanged segment|spool piece|custom-built|purpose-built|welded/i

// Placeholder / filler slot labels the BoM uses to pad a module to its slot count
// ("Filler word 9", "Filler 13", "Component 4", "Word 7", "TBD", "Item N"). These
// are NOT real engineering components — an advisor question grounded on one reads
// as a broken "Does the Filler word 9 specification support…?" line, which is the
// opposite of the credibility the block is meant to carry. Universal across all
// classes; matched on the RESOLVED human label so it catches every gather path.
const PLACEHOLDER_LABEL_RE = /^(?:filler(?:\s+word)?|component|word|item|part|sub[\s-]?module|placeholder|slot|tbd|tba|n\/a)\s*\d*$/i

function isPlaceholderLabel(s: string): boolean {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return !t || PLACEHOLDER_LABEL_RE.test(t)
}

// ── open-item gathering (the deterministic spine) ───────────────────────────────

/**
 * Gather the open items for ONE module instance. Pure + deterministic — every
 * item traces to real chain-computed data. Returns [] when the module has no
 * genuine open items (the caller then emits a sensible "confirm intent" card).
 */
export function gatherModuleOpenItems(state: any, modules: any[], instanceIdx: number): OpenItem[] {
  const mod = modules[instanceIdx]
  if (!mod) return []
  const modId = String(mod?.module ?? mod?.module_id ?? '').trim()
  const items: OpenItem[] = []

  const { wordToInstance, formByWordId } = buildWordIndex(modules)

  // ── (1) physics-critic findings tagged to THIS module instance ────────────────
  // `where` = "<moduleId>/sub_modules[N]/words[M]". Match the module id, then map
  // the finding to the instance whose sub-module index range contains N. Drop the
  // non-physical META-FINDINGS (truncated-JSON / pipeline artefacts) with the same
  // guard the risk register uses, so the advisor block never asks about a data bug.
  const rawIssues = Array.isArray(state?.physicsCritique?.issues) ? state.physicsCritique.issues : []
  for (const f of rawIssues) {
    if (!isPhysicalRisk(f)) continue
    const where = String(f?.where ?? '')
    // Module id must prefix the path (the critic uses the bare taxonomy id).
    if (!where.startsWith(modId + '/') && where !== modId) continue
    const subMatch = where.match(/sub_modules\[(\d+)\]/)
    const subIdx = subMatch ? parseInt(subMatch[1], 10) : null
    // Disambiguate duplicate-id instances: the finding belongs to THIS instance
    // only if its sub-index is in range AND this is the first same-id instance
    // whose range covers it. We approximate the per-instance range by counting
    // sub-modules of each preceding same-id instance.
    if (subIdx != null) {
      // Which same-id instance owns sub-index `subIdx`? The critic resets the
      // sub-index per module, so subIdx is local to this module's sub_modules[].
      // It belongs here iff subIdx < this instance's sub-module count.
      if (subIdx >= subModuleCount(mod)) continue
      // And if an EARLIER same-id instance also has that sub-index, the finding
      // is ambiguous between them; assign it to the first same-id instance only,
      // so it isn't double-counted across the duplicate trains.
      const firstSameId = modules.findIndex(
        (m) => String(m?.module ?? m?.module_id ?? '').trim() === modId && subIdx < subModuleCount(m),
      )
      if (firstSameId !== instanceIdx) continue
    } else {
      // Module-level finding (no sub index): attach to the first same-id instance.
      const firstSameId = modules.findIndex((m) => String(m?.module ?? m?.module_id ?? '').trim() === modId)
      if (firstSameId !== instanceIdx) continue
    }
    const sev = String(f?.severity ?? '').toLowerCase()
    const issue = clip(String(f?.issue ?? ''), 600)
    const check = clip(String(f?.suggested_check ?? f?.suggested_fix ?? ''), 400)
    if (!issue) continue
    // Resolve the subject (the component/sub-module the finding sits on).
    let subject = ''
    const sm = subIdx != null ? (Array.isArray(mod?.sub_modules) ? mod.sub_modules[subIdx] : null) : null
    const wordMatch = where.match(/words\[(\d+)\]/)
    if (sm && wordMatch) {
      const w = Array.isArray(sm?.words) ? sm.words[parseInt(wordMatch[1], 10)] : null
      subject = humaniseWord(String(w?.name_human ?? w?.id ?? w?.word_id ?? ''))
    }
    if (!subject && sm) subject = humaniseWord(String(sm?.name_human ?? sm?.id ?? ''))
    // Don't let a placeholder slot label ("Filler word 9") become the subject —
    // fall back to the module name so `covers`/trace read as real copy.
    if (isPlaceholderLabel(subject)) subject = ''
    items.push({
      kind: 'physics',
      text: `First-principles physics check (${sev || 'flagged'}, confidence ${String(f?.confidence ?? 'unknown')}): ${issue}${check ? ` — the engine's suggested check: ${check}` : ''}`,
      subject: subject || moduleName(mod),
      trace: `7-5-physics-critique.json · ${String(f?.dimension ?? 'engineering')}, severity ${sev || 'flagged'}, confidence ${String(f?.confidence ?? 'unknown')}${subject ? ` (on the ${subject})` : ''}`,
      weight: sev.startsWith('h') || sev.startsWith('c') ? 100 : sev.startsWith('m') ? 50 : 20,
    })
  }

  // ── (2) cost-basis open items: rfq_recommended, made-to-order, ±30% band ──────
  // costBasis.lines key by bare module id; resolve each line to its owning module
  // INSTANCE via word_id so duplicate-id modules don't share each other's lines.
  const costLines = Array.isArray(state?.costBasis?.lines) ? state.costBasis.lines : []
  for (const l of costLines) {
    if (String(l?.module ?? '').trim() !== modId) continue
    const wid = String(l?.word_id ?? '').trim()
    if (wid && wordToInstance.has(wid) && wordToInstance.get(wid) !== instanceIdx) continue
    const label = humaniseWord(String(l?.label ?? l?.word_id ?? ''))
    // Skip placeholder/filler slot lines — a question grounded on "Filler word 9"
    // is not a real engineering item and reads as broken copy (defensive guard).
    if (isPlaceholderLabel(label)) continue
    const basis = l?.basis ?? {}
    const method = String(basis?.method ?? '').toLowerCase()
    const estClass = num(basis?.estimate_class)
    const form = wid ? (formByWordId.get(wid) ?? '') : ''
    const rfq = basis?.rfq_recommended === true

    if (rfq) {
      items.push({
        kind: 'rfq',
        text: `The ${label} is flagged for a request-for-quotation — its price was not taken from a catalogue, so the specification needs an engineer's confirmation before it is firm.`,
        subject: label,
        trace: `state.costBasis.lines · ${label} (basis.rfq_recommended = true, method ${method || 'estimated'})`,
        weight: 35,
      })
    } else if (MADE_TO_ORDER_RE.test(form) || method === 'material_takeoff' || method === 'capacity_factored') {
      // A made-to-order / fabricated / take-off-costed item: the design intent
      // (size, duty, materials) needs validating because there is no off-the-shelf
      // datasheet behind it.
      const descr = form ? clip(form, 120) : `${method.replace(/_/g, ' ')} basis`
      items.push({
        kind: 'made_to_order',
        text: `The ${label} is a made-to-order / fabricated item (${descr}); its design intent — size, duty and materials — should be validated by a specialist because there is no off-the-shelf datasheet behind it.`,
        subject: label,
        trace: `state.costBasis.lines · ${label}${form ? ` (form: "${clip(form, 80)}")` : ''}, method ${method || 'fabricated'}`,
        weight: 28,
      })
    } else if (estClass != null && estClass >= 4) {
      items.push({
        kind: 'estimate_band',
        text: `The ${label} carries a concept-grade cost estimate (estimate class ${estClass}, roughly ±30%); the underlying sizing and duty assumptions should be confirmed so the design is firm.`,
        subject: label,
        trace: `state.costBasis.lines · ${label} (basis.estimate_class = ${estClass})`,
        weight: 18,
      })
    }
  }

  // ── (3) key engineering assumptions + contract closures that warn ─────────────
  // designDecisions carries gate closures; surface any tagged to this module that
  // is a warning / unrepaired closure (a "validate this" signal).
  const decisions = Array.isArray(state?.designDecisions) ? state.designDecisions : []
  for (const d of decisions) {
    if (String(d?.module ?? '').trim() !== modId) continue
    const kind = String(d?.kind ?? '').toLowerCase()
    if (!/warn|unrepaired|unverified|low.?conf|assumption|open/.test(kind)) continue
    const desc = clip(String(d?.detail ?? d?.note ?? d?.word_name ?? d?.id ?? ''), 300)
    if (!desc) continue
    // Only the first same-id instance carries module-level decisions (no word anchor).
    const firstSameId = modules.findIndex((m) => String(m?.module ?? m?.module_id ?? '').trim() === modId)
    if (firstSameId !== instanceIdx) continue
    items.push({
      kind: 'assumption',
      text: `An engineering closure on this module is flagged (${kind}): ${desc}. It should be confirmed in detailed design.`,
      subject: moduleName(mod),
      trace: `state.designDecisions · ${String(d?.id ?? kind)}`,
      weight: 15,
    })
  }

  return items.sort((a, b) => b.weight - a.weight)
}

// ── unverified brief constraints (module-relevant "—" compliance rows) ──────────
//
// These are DOCUMENT-LEVEL (not per-module in the data), so we gather them once
// and offer them as context the LLM may attach to whichever module they bear on.
// A brief metric/constraint is "unverified" when no achieved value reconciles it.

function gatherUnverifiedBriefConstraints(state: any): string[] {
  const out: string[] = []
  const c = state?.parsedBrief?.constraints ?? {}
  const metrics = Array.isArray(c?.target_performance?.metrics) ? c.target_performance.metrics : []
  const quantities = state?.orchestratorContract?.quantities ?? state?.engineeringContract?.quantities ?? {}
  const qKeys = new Set(Object.keys(quantities).map((k) => k.toLowerCase()))
  for (const m of metrics) {
    const key = String(m?.key_metric ?? '').trim()
    if (!key) continue
    // crude reconciliation: an achieved quantity whose key shares the metric's
    // root noun is "verified"; otherwise it is an unverified brief target.
    const root = key.replace(/_(kg|kw|kwh|t|tpd|pct|per_hr|per_hour|m|mm|v|a|hz|day|year)$/i, '')
    const verified = qKeys.has(key.toLowerCase()) || [...qKeys].some((qk) => qk.includes(root) && root.length > 4)
    if (!verified) {
      out.push(`Brief target "${key.replace(/_/g, ' ')}" = ${m?.value ?? '?'} ${String(m?.unit ?? '')} is stated but not yet independently reconciled by a computed quantity (a "—" compliance row); the specialist should confirm it holds for the buyer's conditions.`)
    }
  }
  return out.slice(0, 4)
}

// ── LLM card synthesis (the universal voice) ────────────────────────────────────

const SYSTEM_PROMPT =
  'You are a senior hardware design adviser writing a "Take this to your advisors" block for one engineering module of a product-design dossier aimed at a non-specialist founder. ' +
  'You name WHO the founder needs in the room before you ask anything: the discipline, the seniority, the exact hands-on background, and the TYPE of company that fields that person. ' +
  'Then you give the questions, each tied to a SPECIFIC open item supplied to you, and a sketch of what a strong answer sounds like so the founder can judge whether the adviser actually knows the work.\n\n' +
  'HARD RULES:\n' +
  '1. DESIGN ONLY. Never write about pricing, getting firm quotes, supplier sourcing, lead times, procurement, request-for-quotation, minimum order quantities, or "get a firm price" — that is handled in a separate sourcing section and is OUT OF SCOPE here. Reframe a flagged-for-quote item as a DESIGN-INTENT question (is the size/duty/material right?), never a price question.\n' +
  '2. EVERY question must trace to one of the OPEN ITEMS supplied. Do NOT invent issues, parts, standards or numbers. If an open item gives a number (a diameter, a velocity, a duty), you may use it; do not add new ones.\n' +
  '3. NO ACRONYMS in any field — spell every term out in full on every mention: "monoethanolamine" not "MEA", "request for quotation" only if unavoidable (prefer not to mention it at all per rule 1), "potassium sulphate" not "K2SO4", "calcium carbonate" not "CaCO3", "carbon dioxide" not "CO2", "Pressure Equipment Directive" not "PED", "Dangerous Substances and Explosive Atmospheres" not "DSEAR". Proper nouns and real product/standard codes are fine.\n' +
  '4. British spelling throughout (programme, behaviour, colour, sulphate, optimise).\n' +
  '5. Name a TYPE of company in "typically_at" (e.g. "a carbon-capture process consultancy", "an equipment vendor\'s application-engineering group") — NEVER a specific named firm.\n' +
  '6. Different parts of one module often need DIFFERENT specialists. Use AT MOST 2 cards. Put the most important open item (a high-severity physics finding) with the most senior, most specific specialist, in card 1.\n' +
  '7. BREVITY IS A HARD CONSTRAINT — this block is a tight checklist, not an essay. Obey EVERY cap:\n' +
  '   • at most 2 cards per module; at most 2 questions per card.\n' +
  '   • each "question" ≤ 18 words. One sharp sentence. State the single thing to confirm. Do NOT restate the part\'s whole spec; do NOT pile up clauses.\n' +
  '   • each "strong_answer" ≤ 22 words. Say what a good answer reaches for; do NOT repeat the question, do NOT add a separate "a weak answer…" clause unless it fits the budget.\n' +
  '   • "background" ≤ 14 words. "typically_at" ≤ 8 words. "covers" ≤ 10 words. "specialist_role" ≤ 10 words. "intro" ≤ 22 words.\n' +
  '   • Crisp and concrete. No padding, no boilerplate, no framing repeated across cards or modules ("This is the single most important conversation…"). Cut every word that is not doing work.\n' +
  'Return STRICT JSON only — no prose, no markdown fences. Your first character must be {.'

function buildUserPrompt(moduleNm: string, productClass: string, items: OpenItem[], briefContext: string[]): string {
  const itemBlock = items.length
    ? items.map((it, i) => `  ${i + 1}. [${it.kind}] on "${it.subject}": ${it.text}\n     (source trace for grounded_in: ${it.trace})`).join('\n')
    : '  (No open items were flagged for this module. Write ONE card: a sensible "confirm the design intent" review — name the single most relevant specialist for a module of this kind and ask them to confirm the overall design intent and sizing holds for the buyer\'s conditions. Do not invent specific findings.)'
  const briefBlock = briefContext.length
    ? `\n\nUnverified brief constraints that MAY bear on this module (attach to a question ONLY if genuinely relevant, otherwise ignore):\n${briefContext.map((b) => `  - ${b}`).join('\n')}`
    : ''
  return (
    `Product class: ${productClass || 'an engineered hardware product'}.\n` +
    `Module: "${moduleNm}".\n\n` +
    `OPEN ITEMS the engine found on THIS run (every question must trace to one of these):\n${itemBlock}${briefBlock}\n\n` +
    `Produce the specialist cards for THIS module. Return STRICT JSON of the shape:\n` +
    `{"intro": "<≤22 words: how many specialists this module needs and why, design-only>", "cards": [{` +
    `"specialist_role": "<≤10-word discipline + seniority headline, e.g. 'A chartered chemical / process engineer'>", ` +
    `"background": "<≤14 words: the exact hands-on background needed to answer well>", ` +
    `"typically_at": "<≤8 words: the TYPE of company that fields this person — never a named firm>", ` +
    `"covers": "<≤10 words: which parts of this module this specialist owns>", ` +
    `"questions": [{"question": "<≤18-word sharp design question>", "grounded_in": "<the open item it traces to, naming the source trace>", "strong_answer": "<≤22 words: what a strong answer reaches for>"}]` +
    `}]}\n` +
    `Use AT MOST 2 cards. Each card has AT MOST 2 questions. Obey EVERY word cap (rule 7) — crisp checklist, no padding. DESIGN ONLY. No acronyms. British spelling.`
  )
}

function parseLooseJson(raw: string): any {
  if (!raw) return null
  const s = String(raw).trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const a = s.indexOf('{')
  const aa = s.indexOf('[')
  const start = aa !== -1 && (a === -1 || aa < a) ? aa : a
  const end = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'))
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(s.slice(start, end + 1))
  } catch {
    return null
  }
}

/**
 * Procurement / pricing leak guard. The prompt forbids it, but we deterministically
 * strip any card/question whose text smells of pricing or procurement so the
 * DESIGN-ONLY contract holds even if the model drifts. Exported for the regression
 * harness invariant. Returns true when the text contains pricing/procurement copy.
 */
const PROCUREMENT_LEAK_RE = /\b(price|pricing|priced|quote|quotation|quoting|cost(?:s|ing|ed)?|£|\$|€|lead[\s-]?time|minimum order|moq|procure|procurement|supplier|vendor|purchase order|firm price|get a price|how much|budget|invoice|discount|payment terms)\b/i

export function questionHasProcurementLeak(q: AdvisorQuestion): boolean {
  const hay = `${q.question} ${q.strong_answer}`
  return PROCUREMENT_LEAK_RE.test(hay)
}

/** Sanitise one card: drop procurement-leak questions; keep the card if any survive. */
function sanitiseCard(card: any): AdvisorCard | null {
  if (!card || typeof card !== 'object') return null
  // expandAcronyms on every rendered field is the belt-and-braces no-acronym
  // guarantee: the prompt instructs the model to spell terms out, but if it
  // echoes an abbreviation from an open-item the deterministic expander still
  // catches it before render (the rendered copy is the contract).
  // Word-cap backstop (matches the prompt's rule-7 caps): the prompt asks the
  // model to stay terse, but these clipWords calls GUARANTEE the lean mockup
  // density even if it over-writes. specialist_role ≤10, background ≤14,
  // typically_at ≤8, covers ≤10, question ≤18, strong_answer ≤22, ≤2 questions.
  // grounded_in keeps its char clip — it is the deterministic SOURCE TRACE
  // (file + finding citation), not prose, and the renderer shows it small.
  const role = expandAcronyms(clipWords(String(card.specialist_role ?? ''), 10))
  if (!role) return null
  const rawQs: any[] = Array.isArray(card.questions) ? card.questions : []
  const questions: AdvisorQuestion[] = rawQs
    .map((q): AdvisorQuestion => ({
      question: expandAcronyms(clipWords(String(q?.question ?? ''), 18)),
      grounded_in: expandAcronyms(clip(String(q?.grounded_in ?? ''), 600)),
      strong_answer: expandAcronyms(clipWords(String(q?.strong_answer ?? ''), 22)),
    }))
    .filter((q) => q.question && !questionHasProcurementLeak(q))
    .slice(0, 2)
  if (questions.length === 0) return null
  return {
    specialist_role: role,
    background: expandAcronyms(clipWords(String(card.background ?? ''), 14)),
    typically_at: expandAcronyms(clipWords(String(card.typically_at ?? ''), 8)),
    covers: expandAcronyms(clipWords(String(card.covers ?? ''), 10)),
    questions,
  }
}

/**
 * Generate the cards for ONE module via the Anthropic-free LLM. Gemini 3.1
 * Flash-Lite at thinking 'high' (investment-grade prose), Grok 4.3 fallback —
 * the exact helper + fallback idiom investor-section.ts uses. Returns [] on any
 * failure (the caller drops that module's block; the renderer no-ops).
 */
async function generateCardsForModule(
  moduleNm: string,
  productClass: string,
  items: OpenItem[],
  briefContext: string[],
  log: (l: string) => void,
): Promise<{ intro: string; cards: AdvisorCard[] }> {
  const userPrompt = buildUserPrompt(moduleNm, productClass, items, briefContext)
  const raw = await callFastExtract(userPrompt, {
    model: GEMINI_3_1_FLASH_LITE,
    systemPrompt: SYSTEM_PROMPT,
    thinkingLevel: 'high',
    maxTokens: 4000,
    timeoutMs: 90_000,
  })
    .catch(() =>
      // Fallback to Grok 4.3 (joint-lowest hallucination, honest workhorse) on any
      // Flash-Lite error/truncation — same pattern as investor-section.ts.
      callFastExtract(userPrompt, {
        model: GROK_4_3,
        systemPrompt: SYSTEM_PROMPT,
        maxTokens: 4000,
        timeoutMs: 120_000,
      }).catch(() => ''),
    )
  const parsed = parseLooseJson(raw)
  if (!parsed) {
    log(`[advisor-engagement] "${moduleNm}": LLM returned no parseable JSON — skipping module`)
    return { intro: '', cards: [] }
  }
  const rawCards: any[] = Array.isArray(parsed?.cards) ? parsed.cards : Array.isArray(parsed) ? parsed : []
  // At most 2 cards (matches the lean mockup density + the prompt's hard cap).
  const cards = rawCards.map(sanitiseCard).filter((c): c is AdvisorCard => c != null).slice(0, 2)
  const intro = clipWords(String(parsed?.intro ?? ''), 22)
  return { intro, cards }
}

// ── top-level builder ───────────────────────────────────────────────────────────

export interface BuildAdvisorOpts {
  log?: (l: string) => void
  /** Max modules processed in parallel (cap fan-out — respects engine concurrency). */
  concurrency?: number
}

/**
 * Build the advisor-engagement map for the whole design. For each module
 * instance: gather its open items deterministically, then call the LLM to turn
 * them into specialist cards. Per-module LLM calls run in limited-parallel
 * batches (default 3) so fan-out is capped, mirroring the template stages.
 *
 * Returns a map keyed by `<moduleId>#<index>` (the renderer reads it the same
 * way). A module that yields no cards is simply absent from the map (the
 * renderer no-ops). Never throws — a single module's failure drops that block.
 */
export async function buildAdvisorEngagement(state: any, opts: BuildAdvisorOpts = {}): Promise<AdvisorEngagement> {
  const log = opts.log ?? ((l: string) => console.error(l))
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 3, 4))
  const modules: any[] = Array.isArray(state?.moduleDecomposition?.modules) ? state.moduleDecomposition.modules : []
  if (modules.length === 0) {
    log('[advisor-engagement] no modules in state — skipping')
    return {}
  }
  const productClass = String(state?.moduleDecomposition?.product_class ?? state?.parsedBrief?.product_class ?? '').trim()
  const briefContext = gatherUnverifiedBriefConstraints(state)

  // Pre-compute each instance's open items + key (deterministic, cheap).
  const jobs = modules.map((mod, idx) => {
    const modId = String(mod?.module ?? mod?.module_id ?? '').trim()
    return {
      idx,
      moduleKey: `${modId}#${idx}`,
      moduleId: modId,
      moduleNm: moduleName(mod),
      items: gatherModuleOpenItems(state, modules, idx),
    }
  })

  const result: AdvisorEngagement = {}
  // Limited-parallel batches (cap fan-out). Each batch awaits before the next.
  for (let i = 0; i < jobs.length; i += concurrency) {
    const batch = jobs.slice(i, i + concurrency)
    const settled = await Promise.all(
      batch.map(async (job) => {
        try {
          const { intro, cards } = await generateCardsForModule(job.moduleNm, productClass, job.items, briefContext, log)
          if (cards.length === 0) return null
          const block: AdvisorModuleBlock = {
            module_key: job.moduleKey,
            module_id: job.moduleId,
            module_name: job.moduleNm,
            intro: intro || `Put this module's design in front of the specialist${cards.length > 1 ? 's' : ''} below before the build.`,
            cards,
          }
          return block
        } catch (err) {
          log(`[advisor-engagement] "${job.moduleNm}" failed (non-fatal): ${(err as Error).message.slice(0, 120)}`)
          return null
        }
      }),
    )
    for (const block of settled) {
      if (block) result[block.module_key] = block
    }
  }

  const moduleCount = Object.keys(result).length
  const cardCount = Object.values(result).reduce((n, b) => n + b.cards.length, 0)
  const groundedCount = Object.values(result).reduce(
    (n, b) => n + b.cards.reduce((m, c) => m + c.questions.length, 0),
    0,
  )
  log(`[advisor-engagement] ${moduleCount}/${modules.length} modules got an advisor block — ${cardCount} specialist cards, ${groundedCount} grounded questions`)
  return result
}
