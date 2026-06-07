/**
 * src/lib/pdf-engine-v2/lib/sourcing-brief.ts
 *
 * Per-sub-module "Specialists & sourcing" derivation (2026-06-07). The Fractional
 * Forge business model is now a lead magnet -> sourcing funnel (validated by the
 * customer + a headhunter partner): the dossier is free; the revenue is the vetted
 * INTRODUCTION to the right PEOPLE and the right SUPPLIERS it routes the reader to.
 *
 * So the report must, per module, tell the reader (a) the TYPE of expert and the
 * specific expertise / credentials that matter, how senior, and how RARE that
 * person is, and (b) the TYPE of supplier plus the key engineering spec they need
 * — and offer to SOURCE both — WITHOUT naming the specific people or printing the
 * brand / part-number (those are the paid step + the paid named bill of materials).
 *
 * This file is PURE + DETERMINISTIC + RENDER-FREE (no @react-pdf import). It is an
 * ADDITIVE presentation layer over data the chain already computed:
 *
 *   - SPECIALIST SOURCING BRIEF. Enriches each existing advisor card
 *     (state.advisorEngagement[moduleKey].cards[]) into a full SOURCING BRIEF:
 *     the discipline, the specific hands-on credentials that matter (classified
 *     from the card's own role / background / covers text — e.g. "has commissioned
 *     a similar unit", "catalyst scale-up", "pressure-vessel welding to code"),
 *     the seniority/gravitas, and a SCARCITY note (how rare the person is). It
 *     invents NO named individuals — it only reframes the card the LLM already
 *     wrote into "who to source, and how to recognise a strong one".
 *
 *   - SUPPLIER SOURCING LINE. For each major part in the module
 *     (costBasis.lines joined to the design word for its `form` / `capacity` /
 *     `dimension` / `rating` modifiers), emits the supplier TYPE + the key
 *     engineering spec (class + spec, e.g. "Multistage process-gas compressor
 *     package, ~1000 t/yr CO2 duty, API 618"), framed as needing sourcing — but
 *     it STRIPS the specific brand + part-number (those live in the BoM + the paid
 *     named bill of materials, never in this section).
 *
 * Keyed by the module INSTANCE (`<moduleId>#<index>`), matching advisor-engagement
 * exactly, so duplicate taxonomy module ids (three `mass_fluid_transport_process`
 * trains in a fuel plant) each get their own brief.
 *
 * Universal across classes (no e-fuel assumptions in the logic — the supplier TYPE
 * comes from the word's own `form` descriptor; the spec comes from its own
 * capacity/dimension/rating modifiers). British spelling; WinAnsi-safe ASCII only
 * in the emitted strings (the renderer also runs normalise_unicode as belt-and-
 * braces). No-acronym handling mirrors advisor-engagement's expandAcronyms map so
 * a raw "CO2" / "316L" descriptor never leaks an abbreviation into the prose.
 */

import type { AdvisorEngagement, AdvisorCard } from './advisor-engagement'

// ── data shapes ───────────────────────────────────────────────────────────────

/** One enriched specialist sourcing brief (built from an existing advisor card). */
export interface SpecialistBrief {
  /** The discipline / job-title headline (from the card's specialist_role). */
  role: string
  /** The specific expertise / credentials that matter for a strong hire. */
  credentials: string
  /** Seniority + gravitas level (chartered / principal / commissioning lead …). */
  seniority: string
  /** How rare this person is (the scarcity signal that motivates "let us source"). */
  scarcity: string
  /** Which parts of the module this specialist owns (from the card's covers). */
  covers: string
}

/** One supplier sourcing line for a major part (brand + part-number STRIPPED). */
export interface SupplierLine {
  /** The human part label (e.g. "CO2 feed compressor"). */
  part_label: string
  /** The supplier TYPE / equipment class (e.g. "Multistage process-gas compressor package"). */
  supplier_type: string
  /** The key engineering spec the supplier must meet (duty / size / material / code). */
  spec: string
}

/** The per-module "Specialists & sourcing" brief. */
export interface ModuleSourcingBrief {
  /** Instance key `<moduleId>#<index>` (matches advisorEngagement). */
  module_key: string
  module_id: string
  module_name: string
  specialists: SpecialistBrief[]
  suppliers: SupplierLine[]
}

export type SourcingBriefs = Record<string, ModuleSourcingBrief>

// ── no-acronym expansion (mirrors advisor-engagement's curated map) ─────────────
// The deterministic strings here echo raw BoM `form` / label substrings that carry
// chemical formulae + standard abbreviations ("316L", "CO2 dryer", "VSD-driven").
// Expand them so no acronym leaks into the rendered sourcing copy. The spec field
// deliberately KEEPS engineering shorthand that is a proper material/standard code
// (316L stainless, API 618) — those are product/standard codes, allowed per the
// no-acronym rule's "code identifiers" exception, but we DO spell out the process
// abbreviations (CO2, MEA, VSD) that read as acronyms.
const ACRONYM_EXPANSIONS: Array<[RegExp, string]> = [
  [/\bMEA\b/g, 'monoethanolamine'],
  [/\bCO2\b/g, 'carbon dioxide'],
  [/\bH2O\b/g, 'water'],
  [/\bH2S\b/g, 'hydrogen sulphide'],
  // H2 -> hydrogen LAST among the H-formulae would be wrong (it would also hit the
  // H2 inside H2O/H2S first); ordering them H2O/H2S BEFORE H2 means the compound
  // formulae are consumed first, then the bare H2 maps to hydrogen.
  [/\bH2\b/g, 'hydrogen'],
  [/\bPRV\b/g, 'pressure-relief valve'],
  [/\bZnO\b/g, 'zinc oxide'],
  [/\bVSD\b/g, 'variable speed drive'],
  [/\bVFD\b/g, 'variable frequency drive'],
  [/\bVOC\b/g, 'volatile organic compound'],
  [/\bSIL\b/g, 'safety integrity level'],
  [/\bHMI\b/g, 'human-machine interface'],
  [/\bPLC\b/g, 'programmable logic controller'],
  [/\bATEX\b/g, 'explosive-atmospheres (ATEX)'],
  [/\bDSEAR\b/g, 'Dangerous Substances and Explosive Atmospheres'],
  [/\bPED\b/g, 'Pressure Equipment Directive'],
  [/\bFT\b/g, 'Fischer-Tropsch'],
]

function expandAcronyms(s: string): string {
  let out = String(s ?? '')
  for (const [re, full] of ACRONYM_EXPANSIONS) out = out.replace(re, full)
  return out
}

// ── string helpers ───────────────────────────────────────────────────────────

/** Whitespace-normalise + trim. */
function tidy(s: string): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim()
}

function clip(s: string, n: number): string {
  const t = tidy(s)
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}...` : t
}

function clipWords(s: string, maxWords: number): string {
  const t = tidy(s)
  if (!t) return ''
  const words = t.split(' ')
  if (words.length <= maxWords) return t
  return `${words.slice(0, maxWords).join(' ').replace(/[\s,;:.-]+$/, '').trimEnd()}...`
}

function cap(s: string): string {
  const t = tidy(s)
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t
}

function humaniseModuleId(id: string): string {
  return tidy(
    String(id ?? '')
      .replace(/#\d+\s*$/, '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase()),
  )
}

// Placeholder / filler slot labels (mirror advisor-engagement) — never a real part.
const PLACEHOLDER_LABEL_RE = /^(?:filler(?:\s+word)?|component|word|item|part|sub[\s-]?module|placeholder|slot|tbd|tba|n\/a)\s*\d*$/i
function isPlaceholderLabel(s: string): boolean {
  const t = tidy(s)
  return !t || PLACEHOLDER_LABEL_RE.test(t)
}

// ── SPECIALIST BRIEF: enrich an advisor card into a sourcing brief ──────────────

/**
 * Classify the seniority / gravitas signal from the card's role + background text.
 * Deterministic keyword read — does NOT invent a title, only surfaces the level the
 * card already implies so the reader knows the gravitas to source for.
 */
function deriveSeniority(role: string, background: string): string {
  const hay = `${role} ${background}`.toLowerCase()
  if (/chartered|principal|fellow|lead engineer|technical authority|head of/.test(hay)) {
    return 'Chartered / principal level (a recognised technical authority who has signed off comparable designs)'
  }
  if (/senior|commission|scale-?up|15\+|20\+|decades?|veteran/.test(hay)) {
    return 'Senior practitioner (hands-on delivery of comparable plant, not a generalist consultant)'
  }
  return 'Experienced specialist (has personally delivered work of this kind, not a generalist)'
}

/**
 * Derive the specific credentials that matter — the concrete proof-of-competence a
 * strong candidate carries. Built from the card's own background + covers text via
 * a universal keyword map (commissioning / scale-up / code-welding / rotating-kit /
 * controls / process-safety), so it reframes what the LLM already wrote into a
 * recognisable hiring signal WITHOUT inventing a named person or a new fact.
 */
function deriveCredentials(card: AdvisorCard): string {
  const role = tidy(String(card?.specialist_role ?? ''))
  const background = tidy(String(card?.background ?? ''))
  const covers = tidy(String(card?.covers ?? ''))
  const hay = `${role} ${background} ${covers}`.toLowerCase()

  const signals: string[] = []
  if (/commission|start-?up|first fill|hand-?over|operational/.test(hay)) {
    signals.push('has personally commissioned a unit of this kind into operation')
  }
  if (/catalyst|reaction|kinetics|selectivity|scale-?up|reactor/.test(hay)) {
    signals.push('has taken a comparable reaction / catalyst system from pilot to full scale')
  }
  if (/weld|pressure vessel|asme|ped|fabricat|vessel|column|metallurg/.test(hay)) {
    signals.push('can specify pressure-vessel and welding requirements to the governing code')
  }
  if (/rotating|compressor|pump|turbine|machine|seal|vibration/.test(hay)) {
    signals.push('has selected and witnessed-tested rotating equipment of this duty')
  }
  if (/control|instrument|plc|safety integrity|interlock|automation|hmi|scada/.test(hay)) {
    signals.push('has written the control philosophy and safety interlocks for plant of this hazard class')
  }
  if (/hazard|safety|atex|explos|fire|relief|hazop|dsear/.test(hay)) {
    signals.push('has led a hazard study and closed the safety case for similar plant')
  }

  // Fall back to a strong generic credential built from the background sentence
  // itself (no invention) so the brief always reads as a real hiring signal.
  if (signals.length === 0) {
    const bg = background ? cap(background.replace(/^(experience|hands-on experience|background)\s+/i, '')) : ''
    return clipWords(
      bg
        ? `Direct, recent experience of exactly this scope: ${bg}`
        : 'Direct, recent experience of exactly this scope on a comparable build',
      26,
    )
  }
  return clipWords(cap(signals.slice(0, 2).join('; and ')) + '.', 34)
}

/**
 * Derive the scarcity note — how rare this person is. This is the line that makes
 * the "let Fractional Forge source them" offer land. Deterministic from the
 * discipline keywords; deliberately honest (we do not claim a person is impossible
 * to find, only that the right one is hard to identify without a network).
 */
function deriveScarcity(card: AdvisorCard): string {
  const hay = `${tidy(String(card?.specialist_role ?? ''))} ${tidy(String(card?.background ?? ''))} ${tidy(String(card?.covers ?? ''))}`.toLowerCase()
  if (/catalyst|reaction|kinetics|selectivity|scale-?up|fischer|tropsch|synthesis/.test(hay)) {
    return 'Rare. Perhaps a few dozen people in the country have taken this exact reaction system to full scale; most sit inside incumbent operators and are not on the open market.'
  }
  if (/commission|start-?up|operational|hand-?over/.test(hay)) {
    return 'Scarce. Commissioning leads with hands-on experience of this plant type are in demand and are usually found by reputation, not by job board.'
  }
  if (/control|instrument|safety integrity|interlock|hazop|process safety|hazard/.test(hay)) {
    return 'Limited supply. Engineers who can own both the controls and the safety case for this hazard class are a small pool and are typically already retained.'
  }
  if (/rotating|compressor|turbine|pump|metallurg|pressure vessel|weld/.test(hay)) {
    return 'Specialised. The right rotating-equipment / pressure-systems engineer for this duty is a niche skill set, easy to mis-hire without sector knowledge.'
  }
  return 'Hard to identify. The right person exists, but separating a genuine specialist from a generalist on a CV alone is the difficult part.'
}

function buildSpecialistBriefs(cards: AdvisorCard[]): SpecialistBrief[] {
  const out: SpecialistBrief[] = []
  for (const card of Array.isArray(cards) ? cards : []) {
    const role = expandAcronyms(clipWords(String(card?.specialist_role ?? ''), 12))
    if (!role) continue
    out.push({
      role,
      credentials: expandAcronyms(deriveCredentials(card)),
      seniority: deriveSeniority(String(card?.specialist_role ?? ''), String(card?.background ?? '')),
      scarcity: deriveScarcity(card),
      covers: expandAcronyms(clipWords(String(card?.covers ?? ''), 12)),
    })
  }
  return out.slice(0, 3)
}

// ── SUPPLIER LINE: derive supplier TYPE + spec from the design word ──────────────

/**
 * Build a word_id -> { instanceIdx, form, capacity, dimension, rating, mass } map
 * so each cost line resolves to its owning module instance and we can read the
 * spec modifiers off the design word. Mirrors advisor-engagement's buildWordIndex
 * (kept local so this file is self-contained).
 */
function buildWordSpecIndex(modules: any[]): Map<
  string,
  { instanceIdx: number; form: string; capacity: string; dimension: string; rating: string; mass: string; material: string }
> {
  const map = new Map<string, { instanceIdx: number; form: string; capacity: string; dimension: string; rating: string; mass: string; material: string }>()
  modules.forEach((mod, instanceIdx) => {
    for (const sm of Array.isArray(mod?.sub_modules) ? mod.sub_modules : []) {
      for (const w of Array.isArray(sm?.words) ? sm.words : []) {
        const wid = tidy(String(w?.id ?? w?.word_id ?? ''))
        if (!wid || map.has(wid)) continue
        const rec = { instanceIdx, form: '', capacity: '', dimension: '', rating: '', mass: '', material: '' }
        for (const mc of Array.isArray(w?.modifier_characters) ? w.modifier_characters : []) {
          const kind = String(mc?.kind ?? '').toLowerCase()
          const value = tidy(String(mc?.value ?? mc?.text ?? ''))
          if (!value) continue
          if (kind === 'form' && !rec.form) rec.form = value
          else if (kind === 'capacity' && !rec.capacity) rec.capacity = value
          else if ((kind === 'dimension' || kind === 'dimensions') && !rec.dimension) rec.dimension = value
          else if (kind === 'rating' && !rec.rating) rec.rating = value
          else if (kind === 'mass' && !rec.mass) rec.mass = value
          else if (kind === 'material' && !rec.material) rec.material = value
        }
        map.set(wid, rec)
      }
    }
  })
  return map
}

// Brand / proprietary-name tokens to STRIP from the form descriptor so the supplier
// TYPE never prints a specific manufacturer or product-series name (the paid named
// BoM is where those live). We strip a leading "<Brand> " only when the form starts
// with a capitalised proper-noun run that is NOT an equipment noun — but the safer,
// universal approach is: the supplier_type comes from the FORM descriptor (which is
// a generic class phrase like "multistage process gas compressor"), and we never
// read the `manufacturer` / `part_number` modifiers into this section at all. The
// only brand risk is a brand baked INTO a form string; this regex removes the
// best-known offenders generically (a Capitalised word immediately followed by a
// model token like "SMV" / "Type 316"), but we keep it conservative to avoid
// mangling real words. In practice the form field is brand-free; this is defence.
const TRAILING_MODEL_CODE_RE = /\s*[-—–]\s*(engineered package|packaged skid|configured|bespoke vessel|made-to-order fabrication|engineered|package)\b.*$/i

/**
 * Turn a word's `form` descriptor into a clean supplier TYPE phrase: drop the
 * trailing procurement qualifier ("- engineered package", "- bespoke vessel"),
 * expand acronyms, cap + clip. If the form is empty, fall back to the part label
 * itself (e.g. "CO2 feed compressor" -> a "compressor" supplier type).
 */
// Descriptive connectives that begin a FUNCTIONAL clause ("...smoothing the supply",
// "...blending make-up gas", "...for jet-range selectivity"). Cutting the type at the
// first of these keeps it a clean equipment CLASS rather than a full spec sentence —
// the function is conveyed elsewhere; the supplier needs the class + the spec tokens.
const FUNCTION_CLAUSE_RE = /\s+\b(?:smoothing|blending|raising|returning|removing|engineered|disengaging|tracking|reducing|reducing\/activating|downstream|protecting|condensing|taking|operating|sized|on each|that\b|which\b|to the\b|to prevent\b|for\b)\b.*$/i

function deriveSupplierType(form: string, label: string): string {
  let t = tidy(form)
  if (t) {
    t = t.replace(TRAILING_MODEL_CODE_RE, '')
    // Keep only the leading TYPE clause: cut at the first comma, then at the first
    // functional connective, so the type reads as a class, not a spec sentence.
    const firstClause = t.split(',')[0]
    if (firstClause && firstClause.split(' ').length >= 2) t = firstClause
    const trimmed = t.replace(FUNCTION_CLAUSE_RE, '').trim()
    if (trimmed.split(' ').length >= 2) t = trimmed
  }
  if (!t) t = tidy(label).replace(/\bword\b/gi, '')
  // cap LAST (after acronym expansion) so an expanded acronym like "ZnO" -> "zinc
  // oxide" still gets a capital initial in the rendered supplier type.
  return cap(expandAcronyms(clipWords(t, 12)))
}

// A modifier value "carries a unit" when it contains a non-numeric unit token
// (e.g. "1.4 m dia x 6 m", "47 kW", "12 bar", "2787 kg") rather than a bare,
// unit-less number ("1000", "73"). The chain's `capacity` / `rating` modifiers are
// frequently bare numbers whose physical unit varies PER PART (the CO2 compressor's
// "1000" is kg/h of feed; another part's "150" is a valve Cv) — appending ANY guessed
// unit to those would be a fabricated, misleading spec, so we drop the unit-less ones
// and keep only the self-describing spec tokens (sized dimensions, mass-with-unit,
// material, standard code). The supplier TYPE already conveys the duty class; the
// reader is told the FULL named spec is the paid upgrade.
function valueCarriesUnit(v: string): boolean {
  const t = tidy(v)
  if (!t) return false
  // Must contain a letter unit or a clear dimensional 'x'/'dia' token alongside a number.
  return /\d/.test(t) && /(m\b|mm\b|cm\b|kg\b|t\b|kw\b|w\b|bar\b|barg\b|pa\b|kpa\b|mpa\b|°c|degc|nm3|m3|l\/|lpm|rpm|v\b|kv\b|a\b|ka\b|hz\b|dn\d|dia|x\s*\d)/i.test(t)
}

/**
 * Build the key-spec string from the design word's modifiers + form. Each token is a
 * spec the supplier must meet; brand-free. We deliberately keep ONLY self-describing
 * tokens (dimensions, mass-with-unit, material, standard code, and capacity/rating
 * ONLY when the modifier value already carries its own unit) — never a bare unit-less
 * number with a guessed unit appended (see valueCarriesUnit); the spec stays honest.
 */
function deriveSpec(
  rec: { capacity: string; dimension: string; rating: string; mass: string; material: string } | undefined,
  form: string,
): string {
  const bits: string[] = []
  if (rec?.dimension) bits.push(clip(rec.dimension, 40))
  // capacity / rating: keep only when the value is self-describing (carries a unit).
  if (rec?.capacity && valueCarriesUnit(rec.capacity)) bits.push(`${clip(rec.capacity, 40)} duty`)
  if (rec?.rating && valueCarriesUnit(rec.rating)) bits.push(clip(rec.rating, 40))
  if (rec?.mass && valueCarriesUnit(rec.mass)) bits.push(`approx ${clip(rec.mass, 24)}`)
  if (rec?.material) bits.push(clip(rec.material, 30))
  // Pull a material / standard token out of the form descriptor (e.g. "316L",
  // "API 618", "PED") — these are allowed code identifiers, and they are the most
  // useful single spec token for an RFQ.
  const codeMatch = tidy(form).match(/\b(316L|304L|321|2205|A105|API\s?6\d{2}|ASME|PED|ATEX|SIL\s?\d|DN\d{2,4})\b/i)
  if (codeMatch) {
    const code = codeMatch[1].toUpperCase().replace(/API(\d)/, 'API $1')
    if (!bits.some((b) => b.toUpperCase().includes(code))) bits.push(code)
  }
  return expandAcronyms(clip(bits.filter(Boolean).join(', '), 130))
}

function buildSupplierLines(
  state: any,
  modules: any[],
  instanceIdx: number,
  modId: string,
  wordIndex: ReturnType<typeof buildWordSpecIndex>,
): SupplierLine[] {
  const costLines = Array.isArray(state?.costBasis?.lines) ? state.costBasis.lines : []
  const out: SupplierLine[] = []
  const seen = new Set<string>()
  for (const l of costLines) {
    if (tidy(String(l?.module ?? '')) !== modId) continue
    const wid = tidy(String(l?.word_id ?? ''))
    // Resolve to the owning module instance (cost lines key by bare module id).
    const rec = wid ? wordIndex.get(wid) : undefined
    if (wid && rec && rec.instanceIdx !== instanceIdx) continue
    // If the line has no word_id (cannot disambiguate the instance), only attach
    // it to the FIRST same-id instance so duplicate trains don't both show it.
    if (!wid || !rec) {
      const firstSameId = modules.findIndex((m) => tidy(String(m?.module ?? m?.module_id ?? '')) === modId)
      if (firstSameId !== instanceIdx) continue
    }
    const label = expandAcronyms(tidy(String(l?.label ?? l?.word_id ?? '')).replace(/\bword\b/gi, ''))
    if (isPlaceholderLabel(label)) continue
    const form = rec?.form ?? ''
    const supplierType = deriveSupplierType(form, label)
    const spec = deriveSpec(rec, form)
    if (!supplierType) continue
    const key = `${label}|${supplierType}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ part_label: cap(label), supplier_type: supplierType, spec })
  }
  // Cap at the most substantial lines — order by presence of a spec (specced parts
  // first) so the brief leads with the parts that genuinely need an RFQ.
  out.sort((a, b) => (b.spec ? 1 : 0) - (a.spec ? 1 : 0))
  return out.slice(0, 8)
}

// ── top-level builder ───────────────────────────────────────────────────────────

/**
 * Build the per-module "Specialists & sourcing" briefs from the chain state. PURE
 * + deterministic + never throws. Keyed by the same `<moduleId>#<index>` instance
 * key advisor-engagement uses, so the renderer can pair a module's advisor cards
 * with its sourcing brief one-to-one. A module with neither specialists nor
 * suppliers is omitted (the renderer no-ops).
 */
export function buildSourcingBriefs(state: any): SourcingBriefs {
  const result: SourcingBriefs = {}
  try {
    const modules: any[] = Array.isArray(state?.moduleDecomposition?.modules) ? state.moduleDecomposition.modules : []
    if (modules.length === 0) return result
    const advisor: AdvisorEngagement = (state?.advisorEngagement && typeof state.advisorEngagement === 'object'
      ? state.advisorEngagement
      : {}) as AdvisorEngagement
    const wordIndex = buildWordSpecIndex(modules)

    modules.forEach((mod, instanceIdx) => {
      const modId = tidy(String(mod?.module ?? mod?.module_id ?? ''))
      const moduleKey = `${modId}#${instanceIdx}`
      const block = advisor[moduleKey]
      const moduleName =
        tidy(String(block?.module_name ?? mod?.module_human ?? mod?.display_name ?? '')) || humaniseModuleId(modId)
      const specialists = buildSpecialistBriefs(Array.isArray(block?.cards) ? block.cards : [])
      const suppliers = buildSupplierLines(state, modules, instanceIdx, modId, wordIndex)
      if (specialists.length === 0 && suppliers.length === 0) return
      result[moduleKey] = { module_key: moduleKey, module_id: modId, module_name: moduleName, specialists, suppliers }
    })
  } catch {
    // Fail-safe: a derivation fault yields an empty map; the renderer no-ops.
    return result
  }
  return result
}
