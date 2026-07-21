#!/usr/bin/env -S npx tsx
/**
 * estimate-missing-prices.tsx — for every word in moduleDecomposition that
 * doesn't have a real distributor price, attach a plausible UK trade price
 * estimate. Updates state.partVerifications (synthesising new rows for words
 * without any verification entry).
 *
 * Engine B (post-council, 2026-05-18): the estimator NO LONGER asks Flash-
 * Lite for "scale-of-one trade pricing". Instead:
 *   1. Determine the brief's annual production volume (per-class default if
 *      undeclared — see component-classes.ts DEFAULT_VOLUME_BY_BUCKET).
 *   2. Classify each part into one of 20 component classes (lookup against
 *      the forge-truth.db pretraining corpus first; Flash-Lite fallback).
 *   3. Compute unit_cost = reference_unit_cost_gbp × interpolate(curve, V).
 *
 * For parts that don't classify (component_class = 'unknown'), fall back to
 * a Flash-Lite call with a NEW volume-aware prompt rather than the old
 * scale-of-one anchor.
 *
 * Per the diagnostic
 * (forgeos-illustration-experiments/pretraining/cost-engine-heatpump-
 * attribution.html): Layer 2 (the old estimator's wrong anchor) was 85% of
 * the heatpump +789% deviation. This patch eliminates that layer.
 *
 * Usage:
 *   npx tsx scripts/estimate-missing-prices.tsx <state.json> [--write] [--volume N]
 *
 * The optional --volume <N> overrides annual production volume. Otherwise
 * read from state.parsedBrief.constraints.annual_production_volume.value or
 * the class default.
 *
 * Cost: ~£0.05-£0.10 per BESS (mostly from on-the-fly classification of
 * parts that aren't in the corpus). Curve lookups are free (deterministic).
 *
 * W3 RELATIONSHIP: this script writes per-part estimates that are ALREADY
 * volume-anchored. The renderer's `applyBatchEconomics()` still multiplies
 * by `bom_scale_factor` on top — for now. After Engine A ships and we re-
 * validate, the W3 multiplier will be retired (set to 1.0). Keep both
 * layered until then per PLAN-2026-05-18 §"W3 retires the day Engine B
 * ships". See drawer forgeos_gotchas_e1f18dd3cfae9ee3.
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs'
import { execFileSync } from 'child_process'
import { resolve } from 'path'
import { homedir } from 'os'
import { join } from 'path'
import Database from 'better-sqlite3'
import {
  COMPONENT_CURVES,
  COMPONENT_CLASS_ORDER,
  interpolateCurve,
  defaultVolumeFor,
  referenceUnitCostFor,
  componentClassFloorGbp,
  keywordFloorGbp,
  keywordCeilingGbp,
  clampToSanityBand,
  classCeilingGbp,
  isConsumable,
  type ComponentClass,
} from '../src/lib/pdf-engine-v2/component-classes'
import {
  lookupCached,
} from '../src/lib/pdf-engine-v2/lib/distributors/db-only-cascade'
// Determinism #86 replay ledger — Engine-B's two Flash-Lite calls (class classification +
// unknown-class price estimate) feed the price slice determinism-check.tsx compares. Both run
// at non-zero temperature (0.1 / 0.3) so they re-rolled hardest on a same-brief re-run. Route
// through the SAME on-disk ledger the chain's callLlm uses; a subprocess shares out/.design-cache
// with the parent because the key is content-hash + the store is a stable cwd-relative dir.
import { cachedDesignStage } from './lib/design-stage-cache'

const CONCURRENCY = 8
const FORGE_TRUTH_DB = join(homedir(), '.forge-truth/forge-truth.db')
const COST_LOG = '/tmp/engine-b-cost.log'

const OPENROUTER_KEY = (() => {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY
  for (const f of [
    '/Users/tristanfischer/secrets/openrouter.env',
    join(process.cwd(), '.env.local'),
  ]) {
    if (existsSync(f)) {
      const content = readFileSync(f, 'utf-8')
      const m = content.match(/^OPENROUTER_API_KEY="?([^\s"]+)"?/m)
      if (m) return m[1]
    }
  }
  try {
    return execFileSync('zsh', ['-ic', 'echo $OPENROUTER_API_KEY'], { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
})()

if (!OPENROUTER_KEY) {
  console.error('[estimate] OPENROUTER_API_KEY not found — cannot estimate prices')
  process.exit(1)
}

interface PartContext {
  word_id: string
  word_name: string
  module: string
  sub_module_id: string
  manufacturer: string | null
  part_number: string | null
  description: string | null
  quantity: number
}

/** Universal "finished commodity" heuristic — applies to every product class.
 *  A finished commodity is a real catalogue item bought from a manufacturer
 *  (40-ft ISO container from CIMC, Copeland compressor, Bosch Rexroth rail).
 *  These are priced at retail catalogue; the production-scale curve discount
 *  (multiplier=0.25 etc) does NOT apply because we're not making them
 *  ourselves. By contrast, custom-fab brackets / sheet-metal enclosures /
 *  bespoke PCBs DO get the curve discount because per-unit cost actually
 *  drops with production volume.
 *
 *  Rule: manufacturer is set, not 'custom fab' or 'TBD', AND part_number
 *  looks like a real SKU (not a placeholder).
 *
 *  ITER-10.5 Sprint 1A (Tristan 2026-05-20 fifth review): direct fix for
 *  the £112.50 40-ft container case. Engine B curve was discounting a
 *  £1,500 catalogue item to £375 then renderer halved it again. */
function isFinishedCommodity(ctx: PartContext): boolean {
  const mfr = String(ctx.manufacturer ?? '').trim().toLowerCase()
  if (!mfr) return false
  if (mfr === 'custom fab' || mfr === 'custom_fab' || mfr === 'tbd' || mfr === 'tba' || mfr === 'n/a') return false
  const pn = String(ctx.part_number ?? '').trim()
  if (!pn) return false
  // Placeholder / custom-fab SKU patterns
  if (/^(tbd|tba|n\/a|custom|fab|placeholder)/i.test(pn)) return false
  // Custom-fab SKUs often start with the product's brief acronym + dash
  // ("VFT-LMB-01" = vertical-farm-trolley LED mounting bracket 01).
  // Real catalogue SKUs almost always include a digit, dash, or letter
  // pattern that doesn't begin with project-specific 2-4 letter prefixes
  // followed by another acronym. Heuristic: if the manufacturer name
  // explicitly says "custom", reject.
  return true
}

/**
 * True when an existing partVerification row already carries a REAL price and
 * therefore needs no estimate. `> 0`, never `!= null` — a distributor cascade
 * miss (Stage 10.5 / gate 20/21) writes `distributor_price_gbp: 0` explicitly on
 * a miss, it never omits the field, so `!= null` alone treats a genuine "no price
 * found" result as "already priced" and permanently skips it (Tristan 2026-07-08,
 * Codema BoM fix: the Ethernet/IP module HMS Networks AB7072-B shipped at £0
 * because of exactly this). A real physical component is never legitimately
 * priced at exactly £0, so `> 0` is the correct, universal "has a price" test —
 * matches every other consumer of this field (build-cost-basis.ts, the G2
 * cost-reality gate in serial-design-chain-v2.tsx, audit-parts-catalogue-
 * distributors.tsx). Exported so the regression harness can proveCatch it.
 */
export function existingPartHasRealPrice(existing: { distributor_price_gbp?: unknown; price_estimate_gbp?: unknown } | undefined | null): boolean {
  return Number(existing?.distributor_price_gbp) > 0 || Number(existing?.price_estimate_gbp) > 0
}

interface PriceEstimate {
  price_estimate_gbp: number
  estimate_low_gbp: number
  estimate_high_gbp: number
  reasoning: string
  // Engine B additions
  component_class: ComponentClass | 'unknown'
  curve_multiplier: number
  reference_unit_cost_gbp: number
  annual_volume: number
  classification_source: 'corpus' | 'flash_lite' | 'fallback' | 'curated' | 'db_cache' | 'rule_based' | 'corpus_price'
  estimate_source: 'curve' | 'flash_lite_unknown_class' | 'db_cache' | 'corpus_price'
  // U1 class ceiling flag — set when the final price was clamped by PRICE_CEILING_BY_COMPONENT_CLASS
  price_class_ceiling_clamped?: boolean
  price_class_ceiling_note?: string
  // C5 sanity clamp flag — set when the final price was clamped by CLASS_PRICE_SANITY_BOUNDS
  price_sanity_clamped?: boolean
  price_sanity_note?: string
}

// ---------------------------------------------------------------------------
// Annual volume resolution — brief value first, then class-bucket default.
// Per the council plan: brief should declare annual_production_volume; if
// missing, defaults are consumer 100k, mid-volume 1k, industrial-heavy 100.
// ---------------------------------------------------------------------------

function resolveAnnualVolume(
  state: any,
  productClassSlug: string,
  cliOverride: number | null,
): { volume: number; source: 'cli' | 'brief' | 'default' } {
  if (cliOverride && cliOverride > 0) return { volume: cliOverride, source: 'cli' }
  const briefVol =
    state?.parsedBrief?.constraints?.annual_production_volume?.value ??
    state?.parsedBrief?.constraints?.annual_volume?.value ??
    null
  if (typeof briefVol === 'number' && briefVol > 0) {
    return { volume: briefVol, source: 'brief' }
  }
  return { volume: defaultVolumeFor(productClassSlug), source: 'default' }
}

// Pull the canonical product class slug from state. Tries the three places
// the slug lives in iter-64 states (varies by pipeline version).
// Run-scoped design scale (set once in main() from the state's contract) — consumed by
// curveEstimateFor → referenceUnitCostFor's utility-tail override gate. Undefined when
// the contract carries no nameplate (gate then defaults to prior behaviour).
let RUN_SCALE_NAMEPLATE_KWH: number | undefined

// Run-scoped device-scale flag (2026-07-12): true when the chain marked this a
// device-scale optical/electronic INSTRUMENT (state.isInstrumentDevice). On such a
// product every ESTIMATED (non-catalogue) part is a COTS commodity — a mislabelled
// oem_subsystem battery must not render at £218. Consumed by deviceScaleCeilingGbp
// in the curve-estimate clamp chain. Universal — a plant/cabinet never carries it.
let RUN_IS_INSTRUMENT_DEVICE = false

// Device-scale price ceiling for an ESTIMATED instrument part (only reached when no
// catalogue/curated/cascade/emitter price exists — those all run BEFORE the curve).
// Returns undefined off an instrument device (no-op). Name-keyed first (a nameplate
// is £3 whatever the LLM guessed), then class-keyed. A handheld benchtop instrument
// has NO single COTS part above ~£55 (an integrated MCU+display board like a PyBadge).
function deviceScaleCeilingGbp(cls: string, name: string): number | undefined {
  if (!RUN_IS_INSTRUMENT_DEVICE) return undefined
  const n = (name || '').toLowerCase()
  if (/nameplate|placard|\blabel\b|marking|legend.plate/.test(n)) return 4
  if (/\bled\b|indicator|annunciat|pilot.light/.test(n)) return 5
  if (/membrane|keypad|overlay|fascia|graphic.overlay/.test(n)) return 12
  if (/\bswitch\b|\bbutton\b|push.?button|rocker|tactile/.test(n)) return 8
  if (/\bfuse\b|polyfuse|\bptc\b|resettable|tvs|esd.protect/.test(n)) return 6
  if (/batter|\bcell\b|\blipo\b|li.?ion|rechargeable/.test(n)) return 25
  if (/connector|header|\bcable\b|jumper|ribbon|jst|qwiic|stemma/.test(n)) return 8
  // DEVICE-COMMODITY noun ceilings (2026-07-21, organoid £25×9-default over-pricing): a
  // benchtop-instrument commodity is a cheap COTS item, NOT a plant part. A £25/£30 flat
  // clamp over-billed 9 unresolved lines (£225 of a £363 BoM). Real device-commodity prices:
  if (/thermal.?(interface|pad)|\btim\b|gap.?(filler|pad)|heatsink.compound/.test(n)) return 4
  if (/\bfan\b|blower|axial.?fan|heatsink.?fan/.test(n)) return 10
  if (/\bheater\b|cartridge.?heat|film.?heat|resistive.?heat|kapton.?heat|silicone.?heat/.test(n)) return 12
  if (/tachomet|\bencoder\b|hall.?(effect|sensor)?|rpm.?sens/.test(n)) return 8
  // a Peltier/TEC + a small pump/vent/filter are pricier commodities — keep them honest so
  // the lowering never UNDER-prices a real part (the CP30238 £28 lesson).
  if (/peltier|thermo.?electric|\btec\b.?module|\btec1\b/.test(n)) return 32
  if (/peristaltic|dosing.?pump|syringe.?pump/.test(n)) return 40
  if (/sterile.?filter|vent.?filter|membrane.?filter|0\.2.?.?m|ptfe.?filter/.test(n)) return 18
  // class-keyed fallback
  if (cls === 'oem_subsystem' || cls === 'electronic_pcb') return 55
  if (cls === 'optical') return 40
  if (cls === 'sensor') return 12       // a benchtop temp probe / thermistor / small sensor is £2-12 (was £25)
  if (cls === 'electronic_passive') return 6
  return 15 // generic estimated device part (was £30 — too plant-ish for a benchtop commodity)
}

function getProductClassSlug(state: any): string {
  return String(
    state?.keyMetrics?.product_class ??
      state?.moduleDecomposition?.product_class ??
      state?.parsedBrief?.product_class ??
      String(state?.projectId || '').split('-')[0]?.toLowerCase() ??
      '',
  ).toLowerCase()
}

// Source-of-truth validity set for ComponentClass: the keys of COMPONENT_CURVES
// are exactly the real component classes. Used to reject corpus values that are
// actually PRODUCT-CLASS slugs (the harvest overloads component_class to also
// tag parts with the product-class for class-scoped price lookup) so they never
// leak into the §17 component-class breakdown. (2026-06-06 FIX C.)
const VALID_COMPONENT_CLASSES: ReadonlySet<string> = new Set<string>(Object.keys(COMPONENT_CURVES))
function isValidComponentClass(v: string): v is ComponentClass {
  return VALID_COMPONENT_CLASSES.has(v)
}

// ---------------------------------------------------------------------------
// Corpus lookup — for a given part name, find a matching pretraining row and
// return its component_class. Uses case-insensitive contains-match against
// the part_name column (cheap; <2 ms per lookup). Returns 'unknown' or null
// when no match (caller falls back to Flash-Lite classification).
// ---------------------------------------------------------------------------

class CorpusClassifier {
  private db: Database.Database | null = null
  private stmt: Database.Statement | null = null
  private memo = new Map<string, ComponentClass | 'unknown' | null>()

  constructor() {
    if (existsSync(FORGE_TRUTH_DB)) {
      this.db = new Database(FORGE_TRUTH_DB, { readonly: true })
      try {
        this.stmt = this.db.prepare(`
          SELECT component_class, COUNT(*) AS n
          FROM pretraining_extracted_parts
          WHERE component_class IS NOT NULL
            AND part_name IS NOT NULL
            AND LOWER(part_name) LIKE ?
          GROUP BY component_class
          ORDER BY n DESC
          LIMIT 1
        `)
      } catch {
        this.db.close()
        this.db = null
      }
    }
  }

  lookup(partName: string): ComponentClass | 'unknown' | null {
    if (!this.stmt) return null
    const key = partName.toLowerCase().trim()
    if (this.memo.has(key)) return this.memo.get(key)!
    // Try exact word-boundary match first via LIKE %word%; trim to <=80 chars.
    const needle = `%${key.slice(0, 80)}%`
    let result: ComponentClass | 'unknown' | null = null
    try {
      const row = this.stmt.get(needle) as any
      if (row && row.component_class) {
        const raw = String(row.component_class)
        // VALIDITY GUARD (2026-06-06 FIX C): the corpus `component_class` column
        // is ALSO used by the growing-DB harvest to stamp parts with the
        // PRODUCT-CLASS slug (e.g. 'co2_mineralisation', 'e_fuel_synthesis') for
        // class-scoped real-price lookup. Those product-class slugs are NOT real
        // ComponentClass members, so returning one (via the blind `as ComponentClass`
        // cast) leaked a bogus "CO2 Mineralisation" component-class line into the
        // §17 breakdown of EVERY other class whose generic part name happened to
        // LIKE-match a co2_mineralisation-tagged corpus row (e_fuel: one £6,800
        // line). Only accept a value that is an actual ComponentClass (a key of
        // COMPONENT_CURVES) or the literal 'unknown'; otherwise return null so the
        // caller falls back to the NAME_KEYWORD_RULES / Flash-Lite classifier.
        // Universal + zero-regression: legitimate component classes still pass; a
        // product-class slug never can. See growing-DB principle (component_class
        // is overloaded as both the true class AND the harvest product-class tag).
        if (raw === 'unknown' || isValidComponentClass(raw)) {
          result = raw as ComponentClass | 'unknown'
        } else {
          result = null
        }
      }
    } catch {
      result = null
    }
    this.memo.set(key, result)
    return result
  }

  close() {
    this.db?.close()
  }
}

// ---------------------------------------------------------------------------
// CORPUS REAL-PRICE LOOKUP (2026-06-04) — the growing-DB pricing primary.
//
// The CorpusClassifier above reads only the corpus row's component_class and
// throws away its real `unit_price_gbp`. So a branded part with NO distributor
// cascade hit fell straight to the Engine-B CLASS ANCHOR — collapsing many
// distinct parts onto one price (the £7,500-×4 fingerprint on the CO₂ dossier)
// and bucketing a £60k Fulton boiler as generic `thermal` (ceiling £15k) so the
// cost self-check false-flagged it 4×.
//
// This lookup PREFERS the corpus's own real price for a part (DB-first, per the
// growing-DB principle): for a part that carries a manufacturer (and ideally an
// MPN), find a corpus row with a MATCHING manufacturer AND a strong MPN / part-
// name match AND a non-null unit_price_gbp — preferring verified, higher-
// confidence rows — and use THAT real price instead of the class anchor.
//
// SCOPING (the zero-regression guarantee): rows are filtered to the part's OWN
// product-class corpus tag (component_class = <product_class_corpus_tag>, e.g.
// 'co2_mineralisation'). The harvest writes parts back class-tagged with the
// product-class slug (growing-DB principle), so a product class whose corpus
// has NO priced product-class-tagged rows (BESS, wind: 0 such rows) gets ZERO
// candidates → byte-identical to today. It also blocks cross-class price bleed
// (a CO₂ "Grundfos CRNE" price can never leak onto a BESS "Grundfos TPE3").
//
// MATCH PRECISION (the critical safety property — see matchCorpusPrice): a row
// only wins on manufacturer-token match AND (exact/near MPN match OR ≥2 strong
// shared name tokens). A loose LIKE '%name%' is deliberately NOT used — it
// could pull a wrong part's price. No manufacturer / no confident match →
// returns null and the caller keeps the class-anchor fallback unchanged.
// ---------------------------------------------------------------------------

export interface CorpusPriceRow {
  part_name: string | null
  manufacturer: string | null
  part_number: string | null
  unit_price_gbp: number | null
  discovery_source: string | null
  confidence: number | null
}

export interface CorpusPriceMatch {
  unit_price_gbp: number
  matched_row: CorpusPriceRow
  match_kind: 'mpn' | 'name'
  reason: string
}

// Manufacturer / part-number tokens that carry NO identity (a placeholder, a
// fabrication marker, or a generic English filler) — never used to match.
const MANUFACTURER_STOPWORDS = new Set([
  'fabricated', 'fabrication', 'bespoke', 'custom', 'customfab', 'tbd', 'tba',
  'n/a', 'na', 'none', 'unspecified', 'unknown', 'various', 'generic', 'oem',
  'multiple', 'assorted',
])

const NAME_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'kit', 'set', 'pack', 'unit', 'units',
  'assembly', 'module', 'system', 'sub', 'sub-module', 'word', 'item', 'type',
  'made', 'order', 'alternate', 'alt', 'spare', 'main', 'aux', 'standard',
  'small', 'large', 'medium', 'left', 'right', 'upper', 'lower', 'inlet',
  'outlet', 'process', 'plant', 'new', 'high', 'low', 'mid', 'duty', 'grade',
])

/** Normalise a manufacturer string to a lower-case identity token set,
 *  dropping stopwords + bracketed asides. */
function manufacturerTokens(raw: string | null | undefined): Set<string> {
  const s = String(raw ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')      // drop "(Crouse-Hinds)" asides
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim()
  const out = new Set<string>()
  for (const t of s.split(/\s+/)) {
    if (t.length < 2) continue
    if (MANUFACTURER_STOPWORDS.has(t)) continue
    out.add(t)
  }
  return out
}

function manufacturerIsReal(raw: string | null | undefined): boolean {
  return manufacturerTokens(raw).size > 0
}

/** Normalise an MPN for comparison: lower-case, strip all non-alphanumerics.
 *  Returns '' for placeholders / too-short tokens. */
function normaliseMpn(raw: string | null | undefined): string {
  const s = String(raw ?? '').toLowerCase()
  if (/^(tbd|tba|n\/a|na|none|custom|generic|placeholder|fabricated|bespoke)/.test(s)) return ''
  // Keep only the leading SKU token (the corpus often appends a free-text gloss:
  // "Electropack EP100 (multi-unit package, frame count TBD)" → "electropackep100"
  // would over-merge, so take alphanumerics of the first parenthesis-free chunk).
  const head = s.split('(')[0]
  const alnum = head.replace(/[^a-z0-9]+/g, '')
  return alnum.length >= 4 ? alnum : ''
}

/** Distinctive lower-case name tokens (length ≥ 4, not a generic stopword,
 *  not a pure number). Used for the strong-name-overlap fallback when there
 *  is no usable MPN on one side. */
function strongNameTokens(raw: string | null | undefined): Set<string> {
  const s = String(raw ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  const out = new Set<string>()
  for (const t of s.split(/\s+/)) {
    if (t.length < 4) continue
    if (NAME_STOPWORDS.has(t)) continue
    if (/^\d+$/.test(t)) continue
    out.add(t)
  }
  return out
}

/** Rank key for preferring rows: verified first, then higher confidence. */
function corpusRowRank(r: CorpusPriceRow): number {
  const verified = /verified/i.test(String(r.discovery_source ?? '')) ? 1 : 0
  const conf = Number.isFinite(Number(r.confidence)) ? Number(r.confidence) : 0
  return verified * 100 + conf // verified dominates; confidence breaks ties
}

/**
 * PURE corpus real-price matcher (no DB; takes the candidate rows). Returns the
 * confident match's real unit_price_gbp, or null when no confident match.
 *
 * A candidate row must FIRST share a manufacturer identity token with the part
 * (so a price can never cross manufacturers). Then it qualifies on EITHER:
 *   • MPN match — normalised MPNs equal, or one is a prefix of the other and the
 *     shorter is ≥ 5 chars (handles "EP100" vs "EP100A"); the strongest signal.
 *   • Strong name overlap — ≥ 2 distinctive shared name tokens (e.g. "stirred"
 *     + "carbonation" + "reactor"); used when an MPN is absent on either side.
 * A single shared generic token (just "pump", just "valve") is NOT enough —
 * that is exactly the loose match that would pull a wrong part's price, so it
 * is rejected. Among qualifying rows, prefer MPN matches over name matches,
 * then verified over candidate, then higher confidence.
 *
 * Exported for the regression harness (tested without a DB, like classifyByRules).
 */
export function matchCorpusPrice(
  rows: CorpusPriceRow[],
  ctx: { word_name: string; manufacturer: string | null; part_number: string | null },
): CorpusPriceMatch | null {
  const partMfrTokens = manufacturerTokens(ctx.manufacturer)
  if (partMfrTokens.size === 0) return null // no real manufacturer → never fire

  const partMpn = normaliseMpn(ctx.part_number)
  const partNameTokens = strongNameTokens(ctx.word_name)

  type Scored = { row: CorpusPriceRow; price: number; kind: 'mpn' | 'name'; rank: number; overlap: number }
  const qualifying: Scored[] = []

  for (const r of rows) {
    const price = Number(r.unit_price_gbp)
    if (!Number.isFinite(price) || price <= 0) continue

    // 1. manufacturer identity must overlap (≥1 shared real token).
    const rowMfrTokens = manufacturerTokens(r.manufacturer)
    if (rowMfrTokens.size === 0) continue
    let mfrShared = false
    for (const t of partMfrTokens) {
      if (rowMfrTokens.has(t)) { mfrShared = true; break }
    }
    if (!mfrShared) continue

    // 2a. MPN match (strongest).
    const rowMpn = normaliseMpn(r.part_number)
    let mpnHit = false
    if (partMpn && rowMpn) {
      if (partMpn === rowMpn) mpnHit = true
      else if (partMpn.startsWith(rowMpn) && rowMpn.length >= 5) mpnHit = true
      else if (rowMpn.startsWith(partMpn) && partMpn.length >= 5) mpnHit = true
    }
    if (mpnHit) {
      qualifying.push({ row: r, price, kind: 'mpn', rank: corpusRowRank(r), overlap: 99 })
      continue
    }

    // 2b. strong name overlap (≥2 distinctive shared tokens). Same manufacturer
    // is already established, so 2 shared specific tokens is a confident match.
    const rowNameTokens = strongNameTokens(r.part_name)
    let overlap = 0
    for (const t of partNameTokens) if (rowNameTokens.has(t)) overlap += 1
    if (overlap >= 2) {
      qualifying.push({ row: r, price, kind: 'name', rank: corpusRowRank(r), overlap })
    }
  }

  if (qualifying.length === 0) return null

  // Prefer MPN matches over name matches; then more name overlap; then verified
  // / higher confidence; then the LOWER price (procurement-conservative tie-break).
  qualifying.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'mpn' ? -1 : 1
    if (b.overlap !== a.overlap) return b.overlap - a.overlap
    if (b.rank !== a.rank) return b.rank - a.rank
    return a.price - b.price
  })
  const best = qualifying[0]
  const r = best.row
  return {
    unit_price_gbp: best.price,
    matched_row: r,
    match_kind: best.kind,
    reason:
      `corpus_price (${best.kind} match): ${r.manufacturer ?? '?'} ${r.part_number ?? ''} "${String(r.part_name ?? '').slice(0, 48)}" ` +
      `@ £${best.price} [${/verified/i.test(String(r.discovery_source ?? '')) ? 'verified' : 'candidate'}, conf ${r.confidence ?? '?'}]`,
  }
}

// A corpus real-price is its own ground truth; only reject a genuinely corrupt
// figure (≤0 or absurdly large = a data-entry error, not a real price). NOT
// clamped to the per-class estimate sanity band — that band is calibrated for
// ESTIMATES (a generic thermal cold-plate caps at £15k), but a real £35k process
// boiler must keep its sourced price (Tristan 2026-06-04). Shared by the
// unpinned corpus tier (Step 3) and the pin-override resolver below.
export const CORPUS_PRICE_ABSURD_MAX_GBP = 10_000_000

export interface PinPriceResolution {
  /** The effective unit price to use for the pinned part. */
  price_gbp: number
  /** Where that price came from: a confident corpus override, or the kept pin. */
  source: 'corpus_price' | 'emitter_list_price'
  /** The corpus match details when source === 'corpus_price' (else null). */
  corpus_match: CorpusPriceMatch | null
}

/**
 * True when the pinned part is a BESPOKE / FABRICATED / MADE-TO-ORDER line — its
 * list_price_gbp pin is a project-specific quotation, NOT a catalogue SKU, so a
 * generic catalogue corpus price must NOT override it (the collateral-damage
 * guard the task calls for: "fabricated / made-to-order parts keep their pin").
 * Detected on the part_number / word_name free text (the manufacturer may be a
 * real fabricator like De Dietrich / Koch-Glitsch). Catalogue parts whose model
 * merely carries a sizing note (e.g. Fulton "Electropack EP100 … frame count
 * TBD") are NOT excluded by the bare "tbd" token alone — only an explicit
 * bespoke / made-to-order / fabricated phrase preserves the pin.
 */
function isFabricatedPinPart(word_name: string | null | undefined, part_number: string | null | undefined): boolean {
  const hay = `${String(word_name ?? '')} ${String(part_number ?? '')}`.toLowerCase()
  return /\b(?:fabricat\w*|bespoke|made[-\s]?to[-\s]?order|built[-\s]?to[-\s]?order|custom[-\s]?(?:fab|built|made)|one[-\s]?off|site[-\s]?fabricated|weld(?:ed)?[-\s]?fabrication)\b/.test(hay)
}

/**
 * PURE pin-override resolver (no DB; takes the candidate corpus rows).
 *
 * An emitter `list_price_gbp` pin is an author catalogue guess — many CO₂ pins
 * collapse onto identical rounded values (£2,400 ×N, £7,500 ×N) which read as
 * fabricated. When the SAME part carries a real manufacturer + MPN / strong name
 * that the class's harvested corpus CONFIDENTLY matches to a REAL `unit_price_gbp`,
 * that sourced price overrides the rounded pin (growing-DB principle).
 *
 * Reuses `matchCorpusPrice` UNCHANGED for the confident-match decision (shared
 * manufacturer + MPN-match OR ≥2 distinctive name tokens; prefers verified, then
 * higher confidence). Collateral-damage guards (the pin wins) — the pin is
 * PRESERVED EXACTLY when ANY of:
 *   • the part has no real manufacturer (matchCorpusPrice would return null);
 *   • the part is BESPOKE / FABRICATED / made-to-order (its pin is a project
 *     quotation, not a catalogue SKU — a generic corpus catalogue price must not
 *     override it, even with a real fabricator manufacturer + a name match);
 *   • the corpus has no confident match for it;
 *   • the matched corpus row's price is null / ≤0 / absurd.
 * Only a real (verified or non-null real unit_price_gbp) confident corpus figure
 * for a CATALOGUE part wins. SCOPING is the caller's job: the rows passed are
 * already filtered to the part's OWN product-class corpus tag, so a class with no
 * priced rows (BESS / wind) yields zero candidates → the pin is byte-identical to
 * before this change.
 *
 * Exported for the regression harness (tested without a DB, like matchCorpusPrice).
 */
export function resolveEmitterPinPrice(
  pinGbp: number,
  ctx: { word_name: string; manufacturer: string | null; part_number: string | null },
  corpusRows: CorpusPriceRow[],
): PinPriceResolution {
  const keepPin: PinPriceResolution = { price_gbp: pinGbp, source: 'emitter_list_price', corpus_match: null }
  // No real manufacturer on the pinned part → matchCorpusPrice would return null
  // anyway; short-circuit so a fabricated pin is provably preserved.
  if (!manufacturerIsReal(ctx.manufacturer)) return keepPin
  // Bespoke / fabricated / made-to-order line → keep the project-quotation pin
  // (do not let a generic catalogue corpus price override a one-off fabrication).
  if (isFabricatedPinPart(ctx.word_name, ctx.part_number)) return keepPin
  const match = matchCorpusPrice(corpusRows, ctx)
  if (!match) return keepPin
  // Only a real, non-corrupt corpus price wins over the pin.
  if (!(match.unit_price_gbp > 0) || match.unit_price_gbp > CORPUS_PRICE_ABSURD_MAX_GBP) return keepPin
  return { price_gbp: match.unit_price_gbp, source: 'corpus_price', corpus_match: match }
}

/**
 * CorpusPriceLookup — DB wrapper around matchCorpusPrice. Reads the corpus rows
 * for ONE product-class tag once (cheap: ≤ a few hundred priced rows per class),
 * then matches each part in memory via the pure matcher. Read-only DB.
 */
class CorpusPriceLookup {
  private db: Database.Database | null = null
  private rows: CorpusPriceRow[] = []
  enabled = false

  constructor(productClassCorpusTag: string) {
    const tag = String(productClassCorpusTag ?? '').trim()
    if (!tag) return
    if (!existsSync(FORGE_TRUTH_DB)) return
    try {
      this.db = new Database(FORGE_TRUTH_DB, { readonly: true })
      const stmt = this.db.prepare(`
        SELECT part_name, manufacturer, part_number, unit_price_gbp, discovery_source, confidence
        FROM pretraining_extracted_parts
        WHERE component_class = ?
          AND unit_price_gbp IS NOT NULL
          AND unit_price_gbp > 0
          AND manufacturer IS NOT NULL
          AND TRIM(manufacturer) <> ''
      `)
      this.rows = stmt.all(tag) as CorpusPriceRow[]
      // Only enable when the product-class corpus actually has priced rows.
      // Classes with none (BESS / wind) leave enabled=false → never fires →
      // byte-identical pricing to before this change.
      this.enabled = this.rows.length > 0
    } catch {
      this.db?.close()
      this.db = null
      this.enabled = false
    }
  }

  lookup(ctx: PartContext): CorpusPriceMatch | null {
    if (!this.enabled) return null
    if (!manufacturerIsReal(ctx.manufacturer)) return null
    return matchCorpusPrice(this.rows, {
      word_name: ctx.word_name,
      manufacturer: ctx.manufacturer,
      part_number: ctx.part_number,
    })
  }

  /**
   * Pin-override resolver for an emitter list_price_gbp pin (delegates to the
   * pure resolveEmitterPinPrice with THIS class's already-loaded corpus rows).
   * Disabled class (no priced rows for the tag) → always keeps the pin, so
   * pricing stays byte-identical for those classes.
   */
  resolvePin(
    pinGbp: number,
    ctx: { word_name: string; manufacturer: string | null; part_number: string | null },
  ): PinPriceResolution {
    if (!this.enabled) return { price_gbp: pinGbp, source: 'emitter_list_price', corpus_match: null }
    return resolveEmitterPinPrice(pinGbp, ctx, this.rows)
  }

  get rowCount(): number {
    return this.rows.length
  }

  close() {
    this.db?.close()
  }
}

// ---------------------------------------------------------------------------
// C4 — DETERMINISTIC RULE-BASED CLASSIFIER (2026-05-28)
//
// Replaces the Flash-Lite classifier for parts that the corpus does not
// recognise. Pure keyword + MPN-prefix matching — zero LLM calls, fully
// deterministic across runs.
//
// Priority: MPN-prefix rules first (manufacturer-namespaced patterns that
// unambiguously identify the part type), then name-keyword rules (ordered
// most-specific → most-generic; first match wins).
//
// Returns null for parts that cannot be classified deterministically —
// those STILL fall back to Flash-Lite (the existing estimatePriceForUnknown
// path) so the Flash-Lite call is now rare (truly unrecognisable parts only).
//
// C4 KEY INVARIANT: smoke detectors, aspirating detection heads, chillers,
// and HVAC units MUST NEVER be classified as `oem_subsystem`. The £10k BESS
// oem_subsystem override makes that classification a £10k price error.
// ---------------------------------------------------------------------------

type RuleEntry = { pattern: RegExp; cls: ComponentClass }

// ── MPN-prefix rules ─────────────────────────────────────────────────────────
// These match `{manufacturer} {mpn}` concatenated, so they can use
// manufacturer-namespaced patterns. Evaluated before name rules.
const MPN_PREFIX_RULES: RuleEntry[] = [
  // VESDA / aspirating smoke detectors → oem_smoke_detection
  { pattern: /\b(vlp|vlf|vls|vls\d|vlp\d|vlt)\b/i,                          cls: 'oem_smoke_detection' },
  // Apollo addressable point detectors → oem_smoke_detection
  { pattern: /\bapollo\b.*\b(55000|55\d{3}|65000|65\d{3}|58000|58\d{3})\b/i, cls: 'oem_smoke_detection' },
  // Hochiki addressable heads → oem_smoke_detection
  { pattern: /\bhochiki\b.*\b(chq-|ce-\d|dcd-|ybo-)/i,                       cls: 'oem_smoke_detection' },
  // Pfannenberg EB XT / CC series → oem_hvac_chiller
  { pattern: /\bpfannenberg\b.*\b(eb.?xt|cc\b)/i,                            cls: 'oem_hvac_chiller' },
  // Stulz precision AC → oem_hvac_chiller
  { pattern: /\bstulz\b/i,                                                    cls: 'oem_hvac_chiller' },
  // Schneider / Airedale / Emerson Liebert → oem_hvac_chiller
  { pattern: /\b(airedale|liebert)\b/i,                                       cls: 'oem_hvac_chiller' },
  // Beckhoff CX / CP series → electronic_pcb (industrial PC / panel)
  { pattern: /\bbeckhoff\b.*\b(cx\d|cp\d|c\d{4})/i,                          cls: 'electronic_pcb' },
  // HMS Anybus → electronic_pcb (fieldbus gateway)
  { pattern: /\b(anybus|hms)\b.*\bab7\d/i,                                    cls: 'electronic_pcb' },
  // Grundfos pumps → mechanical_assembly
  { pattern: /\bgrundfos\b/i,                                                  cls: 'mechanical_assembly' },
  // KSB / Wilo / Lowara pumps → mechanical_assembly
  { pattern: /\b(ksb|wilo|lowara)\b/i,                                        cls: 'mechanical_assembly' },
  // Siemens S7 PLC → electronic_pcb
  { pattern: /\b6es7\b/i,                                                      cls: 'electronic_pcb' },
  // Siemens SIMATIC HMI → electronic_pcb
  { pattern: /\b6av2\b/i,                                                      cls: 'electronic_pcb' },
  // Schaltbau contactor → safety_consumable
  { pattern: /\bschaltbau\b.*\b(c310|c320)\b/i,                               cls: 'safety_consumable' },
  // LEM current transducer → sensor
  { pattern: /\b(lem)\b.*\b(hass|hat|lf)\b/i,                                 cls: 'sensor' },
  // WAGO terminal / connector → electronic_connector
  { pattern: /\b(221-2\d|2273-)/i,                                             cls: 'electronic_connector' },
  // Eaton Bussmann HV fuse → safety_consumable
  { pattern: /\b170m\d/i,                                                       cls: 'safety_consumable' },
]

// ── Name-keyword rules ────────────────────────────────────────────────────────
// Ordered most-specific first. A match on ANY part of the part name / module
// sub-module string wins. All patterns are case-insensitive.
const NAME_KEYWORD_RULES: RuleEntry[] = [
  // ── Growing media / consumables (per-cycle inputs — U2, NEVER capital) ──────
  // Specific growing-media tokens ONLY; bare "rockwool"/"insulation" must stay
  // structural/thermal (BESS Rockboard fire lining, 3D-printer chamber insulation
  // are capital). A rockwool PROPAGATION CUBE / Grodan A-OK is growing media.
  { pattern: /\b(propagation.cube|grodan|rockwool.cube|stonewool.cube|grow.plug|growing.media|growing.medium|growing.substrate|\bcoir\b|perlite|vermiculite|peat.plug)\b/i, cls: 'consumable' },
  // ── Fire / smoke / gas detection (NEVER oem_subsystem) ──────────────────
  { pattern: /\b(aspirating|aspiration|asd)\b.*\b(smoke|detect|sensor)\b|\b(vesda|titanus)\b/i, cls: 'oem_smoke_detection' },
  { pattern: /\b(smoke|heat|flame|optical)\b.*\bdetector\b|\bdetector\b.*\b(smoke|heat|flame)\b/i, cls: 'oem_smoke_detection' },
  { pattern: /\b(fire|gas|methane|hydrogen|co|oxygen|lel)\b.*\b(detector|detection|panel|alarm|suppression)\b/i, cls: 'oem_fire_safety' },
  { pattern: /\b(fire.panel|alarm.panel|suppression.system|gas.suppression|co2.suppression)\b/i, cls: 'oem_fire_safety' },
  // ── HVAC / chiller (NEVER oem_subsystem) ────────────────────────────────
  // VENTILATION-ONLY comes FIRST (2026-07-10, Powerwall exit-32 round 6): a
  // "ventilation system" / extract / exhaust set with NO refrigeration-cycle noun
  // is FANS + louvres + filters — mechanical_assembly money (duty-priced), never
  // the £8,000 packaged-chiller anchor ('Hvac Ventilation System' billed £7,360
  // on a 0.43 kW wall cabinet purely on the 'hvac' keyword). A real chiller/AC
  // (refrigeration-cycle noun present) still routes to oem_hvac_chiller below.
  { pattern: /\b(ventilation|extract|exhaust)\b(?![\s\S]*\b(chiller|refrigerant|conditioning|compressor|split.ac|condenser)\b)/i, cls: 'mechanical_assembly' },
  { pattern: /\b(liquid.chiller|chiller.unit|cooling.chiller|industrial.chiller)\b|\b(eb.xt|cc.series)\b.*\b(pfannenberg|stulz)\b/i, cls: 'oem_hvac_chiller' },
  { pattern: /\b(air.conditioning|air.handling|hvac|rooftop.ac|container.ac|cabinet.ac|split.ac)\b/i, cls: 'oem_hvac_chiller' },
  // ── Aerospace / HAPS structural + comms (NEVER oem_subsystem — council 2026-06-01) ──
  // These names fall through C4 to Flash-Lite, which mis-buckets them as
  // oem_subsystem; with the haps oem_subsystem anchor at £80k they flat-pin at the
  // £50k sanity-max (5 lines on the haps run). Route to their TRUE class. A genuine
  // flight computer / avionics suite IS an oem_subsystem, so it is deliberately
  // NOT listed here (council seat 3: routing it out would under-price a real £80k
  // triplex FCC).
  { pattern: /\b(wing.skin|solar.skin|array.skin|aeroshell|fairing|spar.cap|sandwich.panel|composite.skin|laminate.skin)\b|\bskin\b/i, cls: 'structural_polymer' },
  { pattern: /\b(base.?station|ground.control.station|\bgcs\b|ground.station|rugged.console|control.console|operator.console)\b/i, cls: 'electronic_pcb' },
  { pattern: /\b(ice.protection|anti.?icing|de.?icing|leading.edge.heater)\b/i, cls: 'thermal' },
  // ── Batteries / cells ───────────────────────────────────────────────────
  { pattern: /\b(li.?ion|lfp|nmc|lithium|prismatic.cell|pouch.cell|cylindrical.cell|18650|21700|280ah|100ah|304ah)\b/i, cls: 'battery_cell' },
  { pattern: /\b(lead.acid|agm|vrla|gel.battery|supercap|ultracap)\b/i, cls: 'battery_cell' },
  // ── Power modules / converters ───────────────────────────────────────────
  { pattern: /\b(igbt|sic.module|mosfet.module|half.bridge|full.bridge|power.module|inverter.module|pcs.module)\b/i, cls: 'electronic_power_module' },
  // ── Sensors — specific before generic ───────────────────────────────────
  { pattern: /\b(ntc|ptc|thermistor|temperature.sensor|temp.sensor|rtd|thermocouple|pt100|pt1000)\b/i, cls: 'sensor' },
  { pattern: /\b(hall.effect|current.sensor|current.transducer|voltage.sensor|cell.voltage.monitor|bms.ic)\b/i, cls: 'sensor' },
  { pattern: /\b(pressure.sensor|pressure.transducer|flow.sensor|flow.meter|level.sensor|proximity.sensor)\b/i, cls: 'sensor' },
  { pattern: /\b(accelerometer|gyroscope|imu|encoder|resolver|tachometer|speed.sensor|position.sensor)\b/i, cls: 'sensor' },
  { pattern: /\b(gas.sensor|oxygen.sensor|co2.sensor|humidity.sensor|moisture.sensor)\b/i, cls: 'sensor' },
  // ── Control / compute / comms ────────────────────────────────────────────
  { pattern: /\b(plc\b|programm\w+\slogic|safety.relay|safety.controller|pnoz)\b/i, cls: 'electronic_pcb' },
  { pattern: /\b(industrial.pc|panel.pc|embedded.pc|edge.pc|ipc|hmi|touchscreen.panel)\b/i, cls: 'electronic_pcb' },
  { pattern: /\b(gateway|protocol.converter|fieldbus|modbus|profinet|ethercat|bacnet)\b.*\b(module|card|adapter)\b/i, cls: 'electronic_pcb' },
  { pattern: /\b(bms.master|bms.board|battery.management|ems.pc|scada.pc|energy.management.system)\b/i, cls: 'oem_subsystem' },
  // ── Motors / actuators ───────────────────────────────────────────────────
  { pattern: /\b(bldc|brushless|stepper.motor|servo.motor|servo.drive|linear.actuator|solenoid)\b/i, cls: 'motor_actuator' },
  // ── Pumps — industrial (high-value) before generic ───────────────────────
  { pattern: /\b(centrifugal.pump|end.suction.pump|multistage.pump|peristaltic.pump|process.pump|booster.pump)\b/i, cls: 'mechanical_assembly' },
  { pattern: /\b(circulator.pump|dosing.pump|glycol.pump|coolant.pump|coolant.circulation|coolant.loop)\b/i, cls: 'mechanical_assembly' },
  // ── Transformers / magnetics ──────────────────────────────────────────────
  { pattern: /\b(step.up.transformer|step.down.transformer|isolation.transformer|distribution.transformer|dry.type.transformer|cast.resin.transformer)\b/i, cls: 'magnetic' },
  // 2026-06-05 (e_fuel_synthesis): a bare `transformer` is an electrical magnetic
  // (MV/LV site distribution transformer) → magnetic is correct. Placed AFTER the
  // qualified-reactor rule below would be wrong order; transformer never collides
  // with a process "reactor", so this bare rule is safe. Process equipment never
  // carries the token "transformer".
  { pattern: /\btransformer\b/i, cls: 'magnetic' },
  // 2026-06-03: qualified the bare `reactor` token → it was swallowing PROCESS /
  // nuclear reactors ("carbonation reactor", "reactor pressure vessel") as
  // `magnetic`. An electrical reactor is always qualified (line / smoothing / AC /
  // DC / series / shunt / current-limiting); bare "reactor" now falls through to
  // the process-equipment rules above. Universal correctness fix.
  { pattern: /\b(emi.filter|line.filter|common.mode.choke|differential.mode.choke|dc.choke|ac.choke|(line|smoothing|series|shunt|current.?limiting|ac|dc).?reactor)\b/i, cls: 'magnetic' },
  // ── Process equipment — Power-to-Liquid / Fischer-Tropsch SAF plant (2026-06-05, e_fuel_synthesis) ──
  // A SAF plant's BoM names process-plant unit-operations (fired heaters, FT
  // reactors, hydrocrackers, fractionation columns, knock-out drums, ESD valves,
  // a distributed control system, catalyst charges) that had NO rule here and fell
  // through to the corpus token-classifier — which mis-bucketed them on noise (the
  // L8 SAF run showed "35% Magnetic, Battery Cell, Bioreactor" on a process plant).
  // These ADDITIVE rules route each to its TYPE-correct class. COUNCIL REGRESSION
  // GUARD: SPECIFIC multi-word patterns ONLY — no bare `separator`/`cell`/`isolator`
  // rule (a battery "cell separator" is a micro-porous membrane; an FT "separator"
  // is a pressure vessel — the two must not collide). Verified against the battery
  // terms (cell separator, battery cell, BMS isolator, line reactor) — none match.
  // Fired / process heating + reforming → thermal (ceiling £15k):
  { pattern: /\b(fired.?heater|process.?furnace|reformer(?!ate)|feed.?preheater|combined.?feed.?heater)\b/i, cls: 'thermal' },
  { pattern: /\b(thermal.?oxidiser|thermal.?oxidizer|enclosed.?(ground.?)?(flare|oxidiser|oxidizer)|incinerator|catalytic.?oxidiser|catalytic.?oxidizer)\b/i, cls: 'thermal' },
  { pattern: /\b(waste.?heat.?(steam.?)?(generator|recovery|boiler)|heat.?recovery.?steam.?generator|\bhrsg\b)\b/i, cls: 'thermal' },
  // Compression + reaction / conversion rotating + reactor assemblies → mechanical_assembly (ceiling £20k):
  { pattern: /\b(compressor\b|reciprocating.?compressor|centrifugal.?compressor|screw.?compressor|diaphragm.?compressor|recycle.?compressor|booster.?compressor)\b/i, cls: 'mechanical_assembly' },
  { pattern: /\b(fischer.?tropsch.?reactor|\bft.?reactor\b|hydrocrack\w*|hydrotreat\w*|isomerisation.?reactor|isomerization.?reactor|synthesis.?reactor|slurry.?bubble.?column.?reactor)\b/i, cls: 'mechanical_assembly' },
  { pattern: /\b(turbo.?expander|expander.?compressor|hot.?gas.?expander)\b/i, cls: 'mechanical_assembly' },
  // Separation columns + drums + wetted vessels → fluid_path (ceiling £10k):
  { pattern: /\b(fractionation.?column|fractionating.?column|debutaniser|debutanizer|deethaniser|deethanizer|product.?splitter.?column)\b/i, cls: 'fluid_path' },
  { pattern: /\b(three.?phase.?separator|3.?phase.?separator|two.?phase.?separator|knock.?out.?drum|\bko.?drum\b|flash.?drum|steam.?drum|surge.?drum|reflux.?drum|overhead.?drum|coalescer|guard.?bed)\b/i, cls: 'fluid_path' },
  { pattern: /\b(esd.?valve|emergency.?shut.?(down|off).?valve|blowdown.?valve|depressuring.?valve|sdv\b|bdv\b)\b/i, cls: 'fluid_path' },
  { pattern: /\b(api.?650.?tank|api650.?tank|product.?storage.?tank|saf.?(storage.?)?tank|naphtha.?(storage.?)?tank|kerosene.?(storage.?)?tank|crude.?storage.?tank)\b/i, cls: 'fluid_path' },
  // Process control + safety instrumentation + detection → electronic_pcb (ceiling matches control gear):
  { pattern: /\b(distributed.?control.?system|\bdcs\b|safety.?instrumented.?system|\bsis\b|emergency.?shutdown.?system|\besd.?system\b|burner.?management.?system|\bbms.?panel\b)\b/i, cls: 'electronic_pcb' },
  { pattern: /\b(fire.?(and.?|&.?)?gas.?(system|panel|detection)|f.?&.?g.?(system|panel)|gas.?detector|flame.?detector|ir.?flame.?detector|point.?gas.?detector|open.?path.?gas.?detector)\b/i, cls: 'electronic_pcb' },
  // Catalyst charges / reaction consumables (per-fill inputs, NEVER capital) → consumable:
  { pattern: /\b(catalyst.?charge|catalyst.?(inventory|load|fill|bed.?charge)|ft.?catalyst|fischer.?tropsch.?catalyst|cobalt.?catalyst|iron.?catalyst|reduction.?activation|catalyst.?reduction)\b/i, cls: 'consumable' },
  // ── Process equipment — chemical / process plant (2026-06-03, co2_mineralisation) ──
  // Process unit-operations (dryers, reboilers, condensers, columns, reactors,
  // crystallisers, safety showers, bunds) have no rules below and fall through to
  // the corpus token-classifier, which mis-buckets them on noise: "dryer" matched a
  // single junk corpus row classed `safety_consumable` (sane ceiling £5k) and the
  // token "safety" in "safety shower + eyewash" matched `mechanical_fastener`
  // (ceiling £200) → 11× type-outlier, render cost self-check FAIL. These ADDITIVE
  // rules route each to its TYPE-correct class so the price (real macro-pinned
  // £2.2k–£22k) sits inside the class ceiling. Specific-before-generic; only fires
  // on parts that previously had NO rule, so other product classes are unaffected.
  // Heat-transfer process equipment → thermal (ceiling £15k):
  { pattern: /\b(reboiler|condenser|evaporator|recuperator|economiser|economizer|desuperheater)\b/i, cls: 'thermal' },
  { pattern: /\b(dryer|drier|fluid.?bed.?dry|fluidised.?bed|fluidized.?bed|spray.?dry|rotary.?dry|flash.?dry|vibro.?fluidiser)\b/i, cls: 'thermal' },
  { pattern: /\b(steam.?generator|steam.?boiler|process.?boiler|electric.?boiler|hot.?air.?heater|duct.?heater|process.?heater|air.?heater|immersion.?heater)\b/i, cls: 'thermal' },
  { pattern: /\b(cooling.?water.?skid|dry.?cooler|cooling.?tower|chilled.?water.?skid|cooling.?skid)\b/i, cls: 'thermal' },
  // Mass-transfer columns + wetted safety / containment equipment → fluid_path (ceiling £10k):
  { pattern: /\b(absorber|absorption.?column|stripper|stripping.?column|distillation.?column|packed.?column|scrubber|packed.?tower|wash.?column|rectif\w+.?column)\b/i, cls: 'fluid_path' },
  { pattern: /\b(structured.?packing|random.?packing|mellapak|raschig|pall.?ring|packing.?bed|column.?packing)\b/i, cls: 'fluid_path' },
  { pattern: /\b(safety.?shower|emergency.?shower|eyewash|eye.?wash|deluge.?shower|drench.?shower)\b/i, cls: 'fluid_path' },
  { pattern: /\b(bund|bunded.?tray|containment.?tray|spill.?tray|drip.?tray|bunding)\b/i, cls: 'fluid_path' },
  { pattern: /\b(storage.?tank|buffer.?tank|day.?tank|process.?tank|mixing.?tank|surge.?tank|reclaim.?tank|wash.?water.?tank|atmospheric.?tank)\b/i, cls: 'fluid_path' },
  { pattern: /\b(belt.?filter|vacuum.?filter|filter.?press|leaf.?filter|drum.?filter|nutsche|wash.?manifold|spray.?manifold)\b/i, cls: 'fluid_path' },
  // Rotating / agitated process assemblies → mechanical_assembly (ceiling £20k):
  { pattern: /\b(stirred.?reactor|carbonation.?reactor|reaction.?vessel|agitated.?vessel|jacketed.?vessel|stirred.?tank|crystalliser|crystallizer|recrystalliser|recrystallizer)\b/i, cls: 'mechanical_assembly' },
  { pattern: /\b(agitator|impeller.?drive|mixer.?drive|top.?entry.?agitator|side.?entry.?agitator)\b/i, cls: 'mechanical_assembly' },
  { pattern: /\b(centrifuge|pusher.?centrifuge|decanter.?centrifuge|screw.?feeder|metering.?screw|loss.?in.?weight.?feeder|dosing.?feeder|hopper)\b/i, cls: 'mechanical_assembly' },
  { pattern: /\b(bagging.?machine|open.?mouth.?bagger|bagger|palletiser|palletizer|pallet.?wrapper|stretch.?wrapper|heat.?sealer|band.?sealer)\b/i, cls: 'mechanical_assembly' },
  // ── Thermal management ────────────────────────────────────────────────────
  { pattern: /\b(cold.plate|liquid.cooling.plate|heatsink|heat.sink|heat.exchanger|plate.heat.exchanger|bphe|thermal.interface|tim.pad|tim.sheet)\b/i, cls: 'thermal' },
  { pattern: /\b(cooling.fan|condenser.fan|evaporator.fan|axial.fan|blower)\b/i, cls: 'thermal' },
  { pattern: /\b(pipe.insulation|armaflex|kingspan|pir.panel|insulation.panel)\b/i, cls: 'thermal' },
  // ── Fluid path ───────────────────────────────────────────────────────────
  { pattern: /\b(pipe\b|copper.pipe|stainless.pipe|manifold|valve\b|service.valve|expansion.valve|isolation.valve|relief.valve|check.valve|ball.valve|gate.valve)\b/i, cls: 'fluid_path' },
  { pattern: /\b(fitting|compression.fitting|push.fit|push.connect|tee|elbow|nipple|adaptor|coupl)\b/i, cls: 'fluid_path' },
  { pattern: /\b(hose|flexible.hose|coolant.hose|glycol.hose|expansion.vessel|accumulator)\b/i, cls: 'fluid_path' },
  // ── Safety consumables ────────────────────────────────────────────────────
  { pattern: /\b(fuse\b|fuse.holder|hrc.fuse|current.limiting.fuse|semiconductor.fuse)\b/i, cls: 'safety_consumable' },
  { pattern: /\b(mcb\b|mccb|rcd\b|rcbo|circuit.breaker|miniature.circuit.breaker|residual.current)\b/i, cls: 'safety_consumable' },
  { pattern: /\b(contactor\b|main.contactor|pre.charge.contactor|dc.contactor|hv.contactor|relay\b)\b/i, cls: 'safety_consumable' },
  { pattern: /\b(e.stop|emergency.stop|estop|isolator|disconnect|interlock|safety.switch)\b/i, cls: 'safety_consumable' },
  // ── Electronic connectors ─────────────────────────────────────────────────
  { pattern: /\b(busbar.strip|cell.busbar|inter.cell|busbar\b|terminal.block|din.terminal|cable.lug|crimped.terminal)\b/i, cls: 'electronic_connector' },
  { pattern: /\b(connector\b|plug\b|socket\b|header\b|molex|jst|rj45|m12.connector|circular.connector)\b/i, cls: 'electronic_connector' },
  // ── Electronic passives ───────────────────────────────────────────────────
  { pattern: /\b(capacitor|mlcc|electrolytic.cap|dc.link.cap|film.cap|varistor|mov|tvs.diode|zener)\b/i, cls: 'electronic_passive' },
  { pattern: /\b(resistor|shunt.resistor|current.sense.resistor|inducto\w+\b)\b/i, cls: 'electronic_passive' },
  // ── Structural metal / polymer ─────────────────────────────────────────────
  { pattern: /\b(insulation.pad|cell.pad|thermal.pad.cell|spacer.pad)\b/i, cls: 'structural_polymer' },
  { pattern: /\b(bracket|chassis|frame|weldment|mounting.plate|steel.enclosure|cable.tray|cable.duct)\b/i, cls: 'structural_metal' },
  { pattern: /\b(gasket|o.ring|seal\b|grommet|polymer.housing|moulded)\b/i, cls: 'structural_polymer' },
  // ── Cable assemblies ──────────────────────────────────────────────────────
  { pattern: /\b(cable.assembly|harness|ribbon.cable|coax|data.cable|power.cable|ground.cable|earth.cable|earth.strap)\b/i, cls: 'electronic_cable' },
  // ── Fasteners ─────────────────────────────────────────────────────────────
  { pattern: /\b(bolt\b|nut\b|washer\b|screw\b|rivet|spring.washer|lock.washer|anti.vibration)\b/i, cls: 'mechanical_fastener' },
  // ── Optical ───────────────────────────────────────────────────────────────
  { pattern: /\b(led\b|photodiode|display|lcd|oled|lens|indicator.light|status.light)\b/i, cls: 'optical' },
]

/**
 * C4 — deterministic rule-based classifier. Returns the component class or
 * null when the part cannot be classified deterministically. No LLM calls.
 *
 * Evaluation order:
 *   1. MPN-prefix rules (match against `{manufacturer} {mpn}` string).
 *   2. Name-keyword rules (match against the full part name).
 *
 * Invariant: smoke/detector/aspirating/chiller/hvac keywords NEVER return
 * `oem_subsystem` — they route to `oem_smoke_detection` or `oem_hvac_chiller`.
 */
export function classifyByRules(ctx: PartContext): ComponentClass | null {
  // 1. MPN-prefix rules — most reliable signal
  if (ctx.manufacturer || ctx.part_number) {
    const mpnHay = [String(ctx.manufacturer ?? ''), String(ctx.part_number ?? '')].join(' ').trim()
    for (const r of MPN_PREFIX_RULES) {
      if (r.pattern.test(mpnHay)) return r.cls
    }
  }
  // 2. Name-keyword rules — broad but ordered specific→generic
  const nameHay = String(ctx.word_name ?? '').trim()
  if (nameHay) {
    for (const r of NAME_KEYWORD_RULES) {
      if (r.pattern.test(nameHay)) return r.cls
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Flash-Lite on-the-fly classification for parts not in the corpus.
// Batched up to 20 at a time (small enough that Flash-Lite doesn't self-
// summarise — drawer forgeos_gotchas_115d8319262232ae).
// ---------------------------------------------------------------------------

async function classifyOnTheFly(
  parts: Array<{ ctx: PartContext }>,
): Promise<Map<string, ComponentClass | 'unknown'>> {
  const result = new Map<string, ComponentClass | 'unknown'>()
  if (parts.length === 0) return result
  const classList = COMPONENT_CLASS_ORDER.join(', ')
  const partsJson = parts
    .map((p, i) => {
      const ctx = p.ctx
      const bits = [`idx=${i}`, `name="${ctx.word_name.replace(/"/g, "'").slice(0, 120)}"`]
      if (ctx.manufacturer) bits.push(`mfr="${ctx.manufacturer.slice(0, 40)}"`)
      if (ctx.part_number) bits.push(`pn="${ctx.part_number.slice(0, 40)}"`)
      if (ctx.module) bits.push(`module=${ctx.module}`)
      return `  - { ${bits.join(', ')} }`
    })
    .join('\n')
  const prompt = `Classify each hardware part below into ONE of these 20 component classes:
${classList}

Class guidance (CRITICAL — read carefully):

oem_subsystem: ONLY for BIG (>£200 typical, >£100 minimum) pre-built modules with substantial BoM inside them — full hermetic compressors, fully-assembled inverters / PSUs / GPU boards / complete BMS mainboards, complete pump assemblies >£100. NEVER for: DC-DC converters, Wi-Fi antennas, emergency stop buttons, RCDs, contactors, MCBs, EMI filters, small pumps <£100, thermostats, gauges, MCU modules, antennas of any kind, push-buttons, relays. Those have their own dedicated classes. RULE OF THUMB: if the part contains the word "antenna", "button", "filter", "thermostat", "switch", "relay", "gauge", "sensor", "converter" — it is NOT oem_subsystem.

electronic_ic: ICs, MCUs, ASICs, FPGAs, RTC chips, ADCs (chip-level only). NOT controller boards.
electronic_pcb: bare PCB or small PCBA / control board (£15-£200). Heat pump controller, anti-icing board, comms board, DC-DC CONVERTER modules, thermostat boards, display PCBAs, expansion-valve drivers.
sensor: thermistor, Hall, IMU, pressure gauge, temperature probe, flow sensor, encoder, transducer, GAS LEAK SENSOR, leak detector, propane sensor.
optical: LEDs, photodiodes, displays (LCD, OLED), lenses. ALSO: WIFI ANTENNAS, ANTENNAS of any kind (radio modules are antenna+IC together — classify as 'optical' if just antenna element; 'electronic_pcb' if module).
safety_consumable: fuses, MCBs, RCDs, contactors, breakers, EMERGENCY STOP BUTTONS, e-stop devices, fire-suppression cartridges, isolation switches, isolators.
thermal: heatsinks, cold plates, fans (cooling fans, condenser fans, evaporator fans — fan ASSEMBLIES go to mechanical_assembly), TIM, plate heat exchangers (BPHE), evaporators, condensers.
fluid_path: pipes, copper tubing, valves (service valves, expansion valves, isolation valves, relief valves), manifolds, fittings, hoses, expansion vessels, refrigerant lines.
magnetic: transformers, EMI FILTERS, line filters, large inductors (>100uH), motor magnets, motor stators, chokes, RF chokes.
motor_actuator: BLDC/stepper/servo motor units, solenoids, linear actuators (the motor itself, not its driver). NOT pumps with motor — pumps go to mechanical_assembly.
electronic_power_module: SiC/IGBT power modules / integrated power stages (the silicon dies — not the assembled PSU).
electronic_passive: discrete resistors, capacitors (including DC-LINK capacitors regardless of physical size), MLCCs, small ferrites, varistors, MOVs.
electronic_discrete: discrete diodes, MOSFETs, BJTs, TVS, single transistors.
electronic_connector: headers, terminal blocks, USB-C, RJ45, Molex/JST, SAE flares, Schrader caps.
electronic_cable: cable assemblies, harnesses, ribbon, coax, mains-cordsets.
structural_metal: chassis, brackets, sheet metal, weldments, frames, base pans, mounting bars.
structural_polymer: injection-moulded plastics, gaskets, polymer housings, mouldings, EPDM/HNBR/PTFE seals (small).
mechanical_fastener: bolts, nuts, washers, pins, springs, rivets, anti-vibration mounts.
mechanical_assembly: hinges, bearings, gears, fan ASSEMBLIES (motor+blade as unit), small PUMP ASSEMBLIES (<£100 like circulator pumps), compressor SHELLS, valve actuators.
battery_cell: lithium-ion cells, lead-acid, supercapacitors.

ANTI-EXAMPLES (these are recurring mis-classifications — DO NOT repeat):
- "Wi-Fi antenna" → optical (or sensor), NEVER oem_subsystem
- "emergency stop button" → safety_consumable, NEVER oem_subsystem
- "DC-DC converter" → electronic_pcb, NEVER oem_subsystem
- "EMI filter" → magnetic, NEVER oem_subsystem
- "Modbus comms board" → electronic_pcb, NEVER oem_subsystem
- "small circulator pump" → mechanical_assembly, NEVER oem_subsystem
- "potting compound" → structural_polymer (or 'unknown' for chemicals), NEVER oem_subsystem

PARTS:
${partsJson}

Return ONLY a JSON array, one entry per part in the same order:
[{"idx":<idx>,"component_class":"<class or 'unknown'>"}, ...]
No prose, no markdown.`
  try {
    // Replay ledger (determinism #86): a hit replays the recorded classifier text; a miss calls
    // OpenRouter once (temperature:0.1 pinned with seed:42) and records it.
    const { value: text } = await cachedDesignStage({
      stage: 'engine-b-classify',
      payload: { model: 'google/gemini-3.1-flash-lite-preview', prompt, temperature: 0.1, maxTokens: 1800 },
      isValid: (v: string) => typeof v === 'string' && v.length > 0,
      run: async () => {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${OPENROUTER_KEY}`,
            'HTTP-Referer': 'https://fractionalforge.com',
            'X-Title': 'ForgeOS Engine B on-the-fly classifier',
          },
          body: JSON.stringify({
            model: 'google/gemini-3.1-flash-lite-preview',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 1800,
            temperature: 0.1,
            seed: 42,
          }),
        })
        if (!res.ok) return ''
        const j: any = await res.json()
        return String(j.choices?.[0]?.message?.content ?? '')
      },
    })
    if (!text) return result
    const m = text.match(/\[[\s\S]*\]/)
    if (!m) return result
    const parsed = JSON.parse(m[0])
    if (!Array.isArray(parsed)) return result
    const valid = new Set<string>([...COMPONENT_CLASS_ORDER, 'unknown'])
    // 2026-05-19 firestorm iter-5 fix: defence-in-depth post-filter. Even with
    // tightened prompt + anti-examples, Flash-Lite occasionally returns
    // oem_subsystem for small parts (DC-DC, antenna, e-stop, EMI filter,
    // potting compound) because the prompt is long and the model's class
    // attribution is heuristic. The £600 oem_subsystem reference price × W3
    // scale = £113.20 — the SAME mis-price observed 5× in iter-3 BoMs across
    // unrelated parts. Override here when the part name contains a forbidden
    // keyword for that class.
    const OEM_SUBSYSTEM_FORBIDDEN = /\b(antenna|button|filter|converter|thermostat|gauge|sensor|relay|contactor|switch|isolator|fuse|breaker|terminal|grommet|gasket|seal|grease|compound|potting|adhesive|silicone|paint|lubricant|fluid|coolant|water|gas|refrigerant|propane|oxygen|nitrogen|gel|wire|cable|hose|pipe|tube|fitting|bolt|nut|washer|spring|pin|rivet|clip|bracket|mount|stand|hinge|bearing)/i
    const overrideClass = (partName: string, currentClass: string): string => {
      if (currentClass !== 'oem_subsystem') return currentClass
      if (!OEM_SUBSYSTEM_FORBIDDEN.test(partName)) return currentClass
      // Forbidden keyword found in oem_subsystem-classified part. Override.
      const lower = partName.toLowerCase()
      if (/\b(antenna)\b/.test(lower)) return 'optical'
      if (/\b(button|switch|isolator|breaker|fuse|relay|contactor)\b/.test(lower)) return 'safety_consumable'
      if (/\b(converter|board|pcb|controller|module|driver)\b/.test(lower)) return 'electronic_pcb'
      if (/\b(filter|choke|inductor|transformer)\b/.test(lower)) return 'magnetic'
      if (/\b(thermostat|gauge|sensor|probe)\b/.test(lower)) return 'sensor'
      if (/\b(gasket|seal|grommet|potting|compound|adhesive|silicone)\b/.test(lower)) return 'structural_polymer'
      if (/\b(hose|pipe|tube|fitting|valve)\b/.test(lower)) return 'fluid_path'
      if (/\b(cable|wire|harness)\b/.test(lower)) return 'electronic_cable'
      if (/\b(bolt|nut|washer|spring|pin|rivet)\b/.test(lower)) return 'mechanical_fastener'
      if (/\b(bracket|mount|hinge|bearing)\b/.test(lower)) return 'mechanical_assembly'
      // Forbidden keyword present but no obvious bucket — mark unknown
      return 'unknown'
    }
    let overrideCount = 0
    for (const r of parsed) {
      const idx = Number(r.idx)
      let cls = String(r.component_class ?? '').trim()
      if (!Number.isFinite(idx) || !valid.has(cls)) continue
      const ctx = parts[idx]?.ctx
      if (!ctx) continue
      const original = cls
      cls = overrideClass(ctx.word_name, cls)
      if (cls !== original) overrideCount += 1
      result.set(ctx.word_id, cls as ComponentClass | 'unknown')
    }
    if (overrideCount > 0) {
      console.log(`[estimate] Engine B classifier override: ${overrideCount} parts moved out of oem_subsystem`)
    }
  } catch (err) {
    console.error('[estimate] on-the-fly classify failed:', err)
  }
  return result
}

// ---------------------------------------------------------------------------
// Small-commodity keyword pre-filter for unknown-class parts (2026-05-21,
// Tristan BESS forensic). Flash-Lite was returning £128 for "cell voltage
// tap wire" (×5000 = £640k!) because it didn't know to bias toward small-
// commodity prices. Universal: short list of keywords that map to a tier
// of typical UK unit prices. When the part name matches, skip the Flash-
// Lite call entirely and use the deterministic floor. Cost Repair can
// still correct upward if a genuinely high-priced item slipped through.
// ---------------------------------------------------------------------------

interface SmallCommodityTier {
  pattern: RegExp
  // Tiered unit prices at different annual production volumes.
  // Council 2026-05-21 verdict (Q1+Q3): original flat prices were 2-3×
  // too high at 100k volume — Tier 2 at £10 systematically overshoots
  // for consumer / mid-vol classes. Now volume-aware.
  unit_gbp_low_vol: number    // ~1-1000 units/yr (bespoke, distributor 1-off)
  unit_gbp_mid_vol: number    // 1k-10k/yr (distributor-discounted, light tooling)
  unit_gbp_high_vol: number   // >50k/yr (commodity, full-tooling OEM contract)
  reason: string
}

const SMALL_COMMODITY_TIERS: SmallCommodityTier[] = [
  // Tier 1: micro commodity — fasteners, micro-electronics, single wires
  // Plus council Q2 additions: standoffs, heat-shrink, crimps, strain relief,
  // cable markers, thermal pads.
  { pattern: /\b(fastener|bolt|nut|screw|rivet|washer|grommet|cable_tie|tie_wrap|spacer_screw|micro_fuse|jumper|ferrite_bead|standoff|pillar|pcb_spacer|heat_shrink|sleeving|spiral_wrap|crimp|spade|pin_terminal|strain_relief|cable_marker|thermal_pad|thermal_paste|tim_pad|cable_saddle|din_end_stop|cable_tray_clip)\b/i,
    unit_gbp_low_vol: 2.0, unit_gbp_mid_vol: 0.8, unit_gbp_high_vol: 0.20,
    reason: 'micro commodity (fastener / small electronic)' },
  { pattern: /\b(voltage_tap_wire|tap_wire|sense_wire|sensing_wire|pilot_wire|signal_wire|trigger_wire|sample_lead)\b/i,
    unit_gbp_low_vol: 3.0, unit_gbp_mid_vol: 1.0, unit_gbp_high_vol: 0.30,
    reason: 'small signal/tap wire' },
  // Tier 2: small fabrication — small clips/lugs/seals/labels.
  // Council Q3 vetoes applied: cable_gland (£0.50-200 spread) +
  // bushing (£0.20-120) + terminal (£0.50-150) DROPPED from this tier
  // — too ambiguous, would false-floor expensive industrial variants.
  // Only the qualified small-variant keywords remain.
  { pattern: /\b(clip|mount(ing)?_clip|tab|spring_clip|ferrule|lug|cable_clamp|p_clip|spacer|pcb_terminal|pcb_terminal_block)\b/i,
    unit_gbp_low_vol: 8, unit_gbp_mid_vol: 2.5, unit_gbp_high_vol: 0.60,
    reason: 'small fabricated clip/terminal' },
  { pattern: /\b(gasket|o_ring|seal|grommet_seal|sleeve|nylon_bushing|polymer_bushing|pg_gland|pg7_gland|pg9_gland|pg11_gland|pg13_gland|pg16_gland|pg21_gland)\b/i,
    unit_gbp_low_vol: 6, unit_gbp_mid_vol: 1.5, unit_gbp_high_vol: 0.50,
    reason: 'small seal/bushing/nylon gland' },
  { pattern: /\b(label|sticker|decal|nameplate|warning_plate)\b/i,
    unit_gbp_low_vol: 3, unit_gbp_mid_vol: 1.0, unit_gbp_high_vol: 0.20,
    reason: 'label/sticker' },
  // Tier 3: small structural — small plates, brackets, panels under 1 m.
  // Council Q1: at 1k/yr £25; at 100k/yr should be £3-8.
  { pattern: /\b(small_bracket|sub_bracket|mounting_bracket|sensor_bracket|micro_bracket)\b/i,
    unit_gbp_low_vol: 25, unit_gbp_mid_vol: 8, unit_gbp_high_vol: 2.5,
    reason: 'small mounting bracket' },
  { pattern: /\b(cable_entry|gland_plate|tray_clip|cover_plate|access_plate|blanking_plate)\b/i,
    unit_gbp_low_vol: 25, unit_gbp_mid_vol: 7, unit_gbp_high_vol: 2.0,
    reason: 'small access/cover plate' },
  // Tier 4: short busbars / cell interconnects.
  // Council Q1: BESS gotcha drawer says cell-to-cell busbar at 100k volume
  // is £0.20-0.50 — the original £25 was 50× too high.
  { pattern: /\b(cell_to_cell|inter_cell|cell_busbar|busbar_short|sense_busbar)\b/i,
    unit_gbp_low_vol: 8, unit_gbp_mid_vol: 1.5, unit_gbp_high_vol: 0.40,
    reason: 'small cell-interconnect busbar' },
  // module_busbar removed from Tier 4 (council Q3: £25-800 spread depending
  // on whether it's a HAPS payload connector or a utility BESS main bus).
]

/**
 * Pick the volume-tier price for a small-commodity match. Council 2026-05-21
 * verdict Q1: flat prices systematically over-shoot for high-volume classes.
 */
function smallCommodityPriceAtVolume(tier: SmallCommodityTier, annualVolume: number): number {
  if (annualVolume >= 50_000) return tier.unit_gbp_high_vol
  if (annualVolume >= 1_000) return tier.unit_gbp_mid_vol
  return tier.unit_gbp_low_vol
}

/**
 * Manufacturer-set veto (council Q3). If the part has a real distributor-
 * sourced manufacturer + part number, the small-commodity floor is the
 * WRONG anchor — the part is a finished catalogue item with its own
 * price. Returning null lets the normal Flash-Lite fallback or downstream
 * cost-repair cite the manufacturer's catalogue price instead.
 */
function isFinishedCommodityVeto(ctx: PartContext): boolean {
  const mfg = String(ctx.manufacturer ?? '').trim()
  const pn = String(ctx.part_number ?? '').trim()
  if (!mfg || !pn) return false
  if (mfg.toLowerCase() === 'unspecified' || mfg.toLowerCase() === 'custom') return false
  // Heuristic: a real catalogue MPN has at least 4 alphanumeric chars
  // and isn't all-letters (which would suggest a category name like "BOLT").
  if (pn.length < 4) return false
  if (!/[0-9]/.test(pn)) return false
  return true
}

function trySmallCommodityFloor(ctx: PartContext, annualVolume: number): { unit_gbp: number; reason: string } | null {
  if (isFinishedCommodityVeto(ctx)) return null
  const name = String(ctx.word_name ?? '').replace(/\s+/g, '_').toLowerCase()
  for (const t of SMALL_COMMODITY_TIERS) {
    if (t.pattern.test(name)) {
      return { unit_gbp: smallCommodityPriceAtVolume(t, annualVolume), reason: t.reason }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Flash-Lite fallback price estimator — used ONLY when the classifier
// returned 'unknown'. New prompt is volume-aware (NOT scale-of-one).
// ---------------------------------------------------------------------------

async function estimatePriceForUnknown(
  ctx: PartContext,
  productClass: string,
  annualVolume: number,
): Promise<{ central: number; low: number; high: number; reasoning: string } | null> {
  const prompt = `You are a UK engineering procurement specialist. Estimate the unit price IN GBP for the part described below AT AN ANNUAL PRODUCTION VOLUME OF ${annualVolume.toLocaleString()} units per year. Use industry-standard component pricing benchmarks for that volume tier. This is NOT scale-of-one distributor pricing — it is the realistic at-volume OEM unit cost.

PART:
  name: ${ctx.word_name}
  module: ${ctx.module}
  sub-module: ${ctx.sub_module_id}
  manufacturer: ${ctx.manufacturer ?? 'unspecified'}
  part number: ${ctx.part_number ?? 'unspecified'}
  context (product type): ${productClass}
  annual production volume: ${annualVolume.toLocaleString()} units/yr
  ${ctx.description ? `description: ${ctx.description.slice(0, 500)}` : ''}

Return ONLY a JSON object (no prose, no code fence):
{"price_estimate_gbp": <central estimate at the given volume>, "estimate_low_gbp": <low end>, "estimate_high_gbp": <high end>, "reasoning": "<one short sentence explaining your reasoning, including the volume tier's effect on pricing>"}

Guidance:
- At 100,000+/yr the part should price near commodity / OEM contract price (often 30-200x cheaper than 1-off distributor price for ICs, plastics, fasteners).
- At 1,000/yr expect distributor-discounted pricing.
- At 100/yr or below distributor 1-off rates apply.
- estimate_low_gbp and estimate_high_gbp bracket a plausible range.
- Use industry knowledge — don't return 0.`

  try {
    // Replay ledger (determinism #86): the unknown-class price estimate feeds partVerifications
    // prices (the slice). temperature:0.3 pinned with seed:42; a hit replays, a miss records.
    const { value: text } = await cachedDesignStage({
      stage: 'engine-b-price-estimate',
      payload: { model: 'google/gemini-3.1-flash-lite-preview', prompt, temperature: 0.3, maxTokens: 300 },
      isValid: (v: string) => typeof v === 'string' && v.length > 0,
      run: async () => {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${OPENROUTER_KEY}`,
            'HTTP-Referer': 'https://fractionalforge.com',
            'X-Title': 'ForgeOS price estimator (unknown class fallback)',
          },
          body: JSON.stringify({
            model: 'google/gemini-3.1-flash-lite-preview',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 300,
            temperature: 0.3,
            seed: 42,
          }),
        })
        if (!res.ok) return ''
        const j: any = await res.json()
        return String(j.choices?.[0]?.message?.content ?? '')
      },
    })
    if (!text) return null
    const jsonMatch = text.match(/\{[\s\S]*?\}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0])
    const central = Number(parsed.price_estimate_gbp)
    const low = Number(parsed.estimate_low_gbp ?? central * 0.7)
    const high = Number(parsed.estimate_high_gbp ?? central * 1.3)
    if (!Number.isFinite(central) || central <= 0) return null
    return {
      central,
      low: Number.isFinite(low) && low > 0 ? low : central * 0.7,
      high: Number.isFinite(high) && high > 0 ? high : central * 1.3,
      reasoning: String(parsed.reasoning ?? '').trim(),
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Pure compute — no LLM. Given a class + volume, return the curve-anchored
// unit cost in GBP. Quantity uncertainty handled by ±25% low/high bracket.
// ---------------------------------------------------------------------------

// 2026-05-28 INTERIM (council L56 part_realism 4.75): industrial OEM parts that
// MISS the distributor cascade (not on Digi-Key/Mouser/Farnell) fell to the
// Engine-B curve, whose per-(product_class, component_class) reference
// over-prices control/comms to ~£10k (Beckhoff CX7000, Anybus AB7634, Phoenix
// QUINT-UPS all rendered £10,000 in BESS L56; real ≈ £300-520) and under-prices
// industrial pumps to ~£35 (Grundfos NB; real ≈ £1.2-2k). This curated table
// gives real catalogue prices for the common offenders, consulted BEFORE the
// curve. Match = manufacturer-regex AND part_number-regex; first hit wins.
// These are FINISHED CATALOGUE prices → not re-scaled by batch economics
// (tagged estimate_source 'curve', which applyBatchEconomics already skips).
// SEED DATA for the full fix: ingest these (+ a real industrial-OEM catalogue
// sweep) into forge-truth.db pretraining_extracted_parts so the cascade reads
// them DB-first and this hardcoded table can be deleted.
export const CURATED_INDUSTRIAL_PRICES: Array<{ mfr: RegExp; pn: RegExp; price_gbp: number; note: string }> = [
  { mfr: /beckhoff/i, pn: /^CX7\d/i, price_gbp: 420, note: 'Beckhoff CX7000-series embedded PC' },
  { mfr: /beckhoff/i, pn: /^CX[59]\d/i, price_gbp: 980, note: 'Beckhoff CX5/9-series embedded PC' },
  { mfr: /\b(hms|anybus)\b/i, pn: /^AB7\d/i, price_gbp: 330, note: 'HMS Anybus Modbus/fieldbus gateway' },
  { mfr: /phoenix/i, pn: /QUINT-?UPS/i, price_gbp: 520, note: 'Phoenix Contact QUINT-UPS DC/DC module' },
  { mfr: /grundfos/i, pn: /\bNB ?\d{2}-\d{2,3}/i, price_gbp: 1650, note: 'Grundfos NB end-suction centrifugal pump' },
  { mfr: /grundfos/i, pn: /\b(CRE?\d|CM\d|MAGNA)/i, price_gbp: 1200, note: 'Grundfos CR/CM/MAGNA circulation pump' },
  { mfr: /siemens/i, pn: /6ES7 ?21[0-9]/i, price_gbp: 280, note: 'Siemens S7-1200 CPU' },
  { mfr: /siemens/i, pn: /6AV2/i, price_gbp: 950, note: 'Siemens SIMATIC HMI panel' },
  { mfr: /moxa/i, pn: /^(EDS|IKS|EDR|MGate)/i, price_gbp: 380, note: 'Moxa industrial ethernet switch/gateway' },
  { mfr: /hirschmann/i, pn: /(GRS|RSP|SPIDER)/i, price_gbp: 650, note: 'Hirschmann industrial switch' },
  { mfr: /advantech/i, pn: /^(UNO|ARK)/i, price_gbp: 600, note: 'Advantech fanless industrial PC' },
]

export function curatedIndustrialPrice(manufacturer: string | null | undefined, partNumber: string | null | undefined): { price_gbp: number; note: string } | null {
  const mfr = String(manufacturer ?? '').trim()
  const pn = String(partNumber ?? '').trim()
  if (!mfr || !pn) return null
  for (const e of CURATED_INDUSTRIAL_PRICES) {
    if (e.mfr.test(mfr) && e.pn.test(pn)) return { price_gbp: e.price_gbp, note: e.note }
  }
  return null
}

function curveEstimateFor(
  cls: ComponentClass,
  annualVolume: number,
  productClassSlug?: string | null,
  keywordCtx?: { name?: string | null; manufacturer?: string | null; part_number?: string | null },
): { central: number; low: number; high: number; multiplier: number; reference: number; floored?: boolean; keyword_floor_note?: string; keyword_ceiling_note?: string; class_ceiling_clamped?: boolean; class_ceiling_note?: string; sanity_clamped?: boolean; sanity_note?: string } {
  // Defensive (2026-05-31): never let an unmapped/invalid component class crash
  // the whole pricing engine. COMPONENT_CURVES covers all 24 ComponentClass
  // values, but a stray runtime value (undefined / a future class added to the
  // type but not the table) would otherwise throw "Cannot read 'curve'". Fall
  // back to the median 'sensor' curve + warn so the BoM is still priced.
  let c = COMPONENT_CURVES[cls]
  if (!c) {
    console.warn(`[estimate] curveEstimateFor: unmapped component class "${String(cls)}" — falling back to 'sensor' curve`)
    c = COMPONENT_CURVES['sensor']
  }
  // Engine B (2026-05-18 BESS investigation): the reference unit cost can be
  // overridden per (product_class, component_class) so industrial-heavy hosts
  // (e.g. utility BESS using 280 Ah LFP prismatics + £100k PCS oem_subsystems)
  // don't get under-priced by the median-part anchor. See
  // PRODUCT_CLASS_REFERENCE_OVERRIDES in component-classes.ts for the table
  // and rationale. The curve shape (volume multiplier) is unchanged — only
  // the magnitude anchor shifts.
  const ref = referenceUnitCostFor(cls, productClassSlug, { nameplateKwh: RUN_SCALE_NAMEPLATE_KWH })
  const m = interpolateCurve(c.curve, annualVolume)
  const raw = ref * m
  // 2026-05-20 iter-8 council fix A: floor clamp. VF iter-7 BoM showed
  // catastrophic under-pricing — 40ft ISO container at £3.38, Osram LED panel
  // £0.38, Kingspan PIR £0.33, Pilz PNOZ S4 safety relay £0.03. Curve fallback
  // produced impossibly low values when ref was small and multiplier was tiny.
  // Engineering sanity floor per component class (universal — applies to every
  // product) clamps the curve so it can't produce values that would suggest
  // misclassification rather than real economy. Curve can still go ABOVE the
  // floor for low-volume / high-margin cases. See COMPONENT_CLASS_FLOORS_GBP
  // in component-classes.ts for the table.
  //
  // 2026-05-28 council L59 (part_realism 3.00): a per-class floor is not enough
  // for ComponentClasses with irreducible intra-class magnitude variance — a
  // fire/gas/smoke detector or industrial PC that MISSES the distributor cascade
  // lands in `sensor` (median £12 → ~£4-8) or `oem_subsystem` (BESS override
  // £10k), both wrong by 10-100×. The PER-CATEGORY keyword floor below fires
  // ONLY when the part NAME matches a known high-value category (gas detector
  // £350, aspirating smoke detector £1,500, PLC £250, UPS £180, IP-rated
  // enclosure £150, industrial pump £1,200, …) and leaves commodities (NTC
  // thermistor, fuse, bracket) untouched. The effective floor is the MAX of the
  // per-class floor and the keyword floor. See CATEGORY_KEYWORD_FLOORS_GBP +
  // keywordFloorGbp() in component-classes.ts.
  const classFloor = componentClassFloorGbp(cls)
  const kw = keywordCtx
    ? keywordFloorGbp(keywordCtx.name, keywordCtx.manufacturer, keywordCtx.part_number)
    : null
  const floor = Math.max(classFloor, kw?.floor_gbp ?? 0)
  const floored = floor > 0 && raw < floor
  let central = floored ? floor : raw
  // 2026-05-28 council L59 (down-direction): cap the curve/override path at a
  // per-category ceiling so a small part misclassified into a high-anchor class
  // (e.g. a £450 Beckhoff IPC inheriting the BESS oem_subsystem £10k override)
  // cannot render at an impossible figure. The ceiling never clips a real
  // catalogue price (curated table / cascade DB / emitter list_price all run
  // before the curve) nor a pinned part. See keywordCeilingGbp().
  const kwCeil = keywordCtx
    ? keywordCeilingGbp(keywordCtx.name, keywordCtx.manufacturer, keywordCtx.part_number)
    : null
  let ceiled = false
  if (kwCeil && central > kwCeil.ceiling_gbp) {
    // Never push below the effective floor (ranges never cross per category).
    central = Math.max(floor, kwCeil.ceiling_gbp)
    ceiled = true
  }
  // U1 — Universal per-class price ceiling (2026-05-29).
  // Applied AFTER keyword ceiling (which targets named categories) and BEFORE
  // the C5 sanity backstop. Catches class-wide over-pricing for null-MPN /
  // median-anchored items where the Engine-B reference is a gross over-estimate
  // for the parts a given product class actually uses in that class.
  //
  // Example: structural_polymer ceiling £50. VF rockwool cube at Engine B ref
  // £22 × curve 1.0 = £22 → capped at £22 (already ≤ £50, no-op). But if a
  // product-class override or a high-volume curve pushes it to £55, the ceiling
  // fires. More critically: at low volume (curve multiplier 1.0) the £22 ref
  // itself is the over-price — the VF structural_polymer override (£8) handles
  // the anchor; the ceiling is the backstop for any class/product combo that
  // was missed by the override table.
  //
  // classCeilingGbp() returns undefined for classes without a ceiling (most)
  // so this block is nearly free for those classes.
  let class_ceiling_clamped = false
  let class_ceiling_note: string | undefined
  const classCeil = classCeilingGbp(cls)
  if (classCeil !== undefined && central > classCeil) {
    // Never push below the effective floor (floor < ceiling by PRICE_CEILING_BY_COMPONENT_CLASS design).
    central = Math.max(floor, classCeil)
    class_ceiling_clamped = true
    class_ceiling_note = `U1 class ceiling: class=${cls}, ceiling=£${classCeil}, clamped from £${round2(ceiled ? kwCeil!.ceiling_gbp : floored ? floor : raw)} to £${round2(central)}`
  }
  // DEVICE-SCALE ceiling (2026-07-12): on a benchtop/handheld INSTRUMENT, an estimated
  // part is a COTS commodity. This is AUTHORITATIVE over the per-class floor — the whole
  // bug is a device battery MISCLASSIFIED as a £280 oem_subsystem whose class FLOOR then
  // blocks the clamp; on a device the small-part reality overrides the plant-class floor.
  // Only estimated parts reach here (catalogue/curated/cascade/emitter all run earlier),
  // so this never clips a real price. Open Colorimeter: battery £218→£25, nameplate £60→£4,
  // membrane £60→£12, indicator LED £37→£5, switch £30→£8.
  const devCeil = deviceScaleCeilingGbp(cls, keywordCtx?.name ?? '')
  if (devCeil !== undefined && central > devCeil) {
    const _before = central
    central = devCeil
    class_ceiling_clamped = true
    class_ceiling_note = `device-scale instrument ceiling: '${keywordCtx?.name ?? cls}' class=${cls} clamped from £${round2(_before)} to £${devCeil} (COTS commodity on a handheld/benchtop device)`
  }
  // C5 — Universal per-class sanity bounds backstop (2026-05-28, BLOCKER per
  // council GLM/Kimi). Runs AFTER keyword floor + ceiling + class ceiling so it
  // catches any residual implausible price regardless of which rule missed it.
  // A price outside [min_gbp, max_gbp] for its class is clamped and flagged.
  const sanity = clampToSanityBand(central, cls)
  let sanity_clamped = false
  let sanity_note: string | undefined
  if (sanity.clamped) {
    central = sanity.price_gbp
    sanity_clamped = true
    sanity_note = `C5 sanity clamp (${sanity.breach}): class=${cls}, raw=£${round2(class_ceiling_clamped ? classCeil! : ceiled ? kwCeil!.ceiling_gbp : floored ? floor : raw)}, clamped=£${round2(central)}`
  }
  return {
    central: round2(central),
    low: round2(central * 0.7),
    high: round2(central * 1.3),
    multiplier: m,
    reference: ref,
    floored,
    keyword_floor_note: kw && floored && (kw.floor_gbp >= classFloor) ? kw.note : undefined,
    keyword_ceiling_note: ceiled ? kwCeil!.note : undefined,
    class_ceiling_clamped: class_ceiling_clamped || undefined,
    class_ceiling_note,
    sanity_clamped,
    sanity_note,
  }
}

function round2(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n * 100) / 100
}

function logCost(line: string) {
  appendFileSync(COST_LOG, `${new Date().toISOString()} | ${line}\n`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2)
  const statePath = resolve(args[0])
  const write = args.includes('--write')
  const volumeOverride = (() => {
    const i = args.indexOf('--volume')
    if (i >= 0 && args[i + 1]) {
      const n = parseInt(args[i + 1], 10)
      if (Number.isFinite(n) && n > 0) return n
    }
    return null
  })()
  if (!existsSync(statePath)) {
    console.error(`State not found: ${statePath}`)
    process.exit(1)
  }
  const state = JSON.parse(readFileSync(statePath, 'utf-8'))
  const productClass = getProductClassSlug(state)
  // Design SCALE for the utility-tail override gate (2026-07-09, Powerwall exit-32):
  // the bess/energy_storage reference overrides are utility-calibrated (oem_subsystem
  // £10k, battery_cell £100/280Ah) — they must not anchor a 14 kWh wall unit. Read the
  // nameplate once per run; referenceUnitCostFor gates the override set on it.
  RUN_SCALE_NAMEPLATE_KWH = (() => {
    const q = state?.orchestratorContract?.quantities ?? {}
    for (const k of ['nameplate_capacity_kwh', 'usable_capacity_kwh']) {
      const v = Number((q[k] as any)?.value)
      if (Number.isFinite(v) && v > 0) return v
    }
    return undefined
  })()
  if (RUN_SCALE_NAMEPLATE_KWH !== undefined) {
    console.log(`[estimate] design scale: nameplate ≈ ${RUN_SCALE_NAMEPLATE_KWH} kWh (utility-tail overrides ${RUN_SCALE_NAMEPLATE_KWH >= 100 ? 'APPLY' : 'GATED OFF — sub-utility scale'})`)
  }
  RUN_IS_INSTRUMENT_DEVICE = Boolean((state as any)?.isInstrumentDevice)
  if (RUN_IS_INSTRUMENT_DEVICE) {
    console.log('[estimate] device-scale INSTRUMENT: estimated parts capped to COTS commodity ceilings (deviceScaleCeilingGbp)')
  }
  const { volume: annualVolume, source: volumeSource } = resolveAnnualVolume(
    state,
    productClass,
    volumeOverride,
  )
  console.log(`[estimate] product_class=${productClass} annual_volume=${annualVolume.toLocaleString()} (${volumeSource})`)

  // Build verificationByCompoundId index.
  // 2026-05-19 fix C1 (audit-found data-corruption bug): previously keyed by
  // bare `w.id` (`'housing'`, `'sensor'`, `'controller'`, etc.). Word IDs are
  // SCOPED per sub-module — different modules with the same word ID collide
  // and the second occurrence silently overwrites the first. Compound key
  // `{module}::{sub_module_id}::{word_id}` makes every BoM line uniquely
  // addressable. Legacy state files that wrote rows without module/sub_module_id
  // also fall back to bare word_id so we don't break them.
  state.partVerifications = state.partVerifications ?? []
  const compoundKey = (module: string | null | undefined, subModuleId: string | null | undefined, wordId: string | null | undefined): string =>
    `${module ?? ''}::${subModuleId ?? ''}::${wordId ?? ''}`
  const verifByCompoundId = new Map<string, any>()
  const verifByLegacyWordId = new Map<string, any>()  // fallback for old rows
  for (const v of state.partVerifications) {
    if (v.word_id) {
      if (v.module && v.sub_module_id) {
        verifByCompoundId.set(compoundKey(v.module, v.sub_module_id, v.word_id), v)
      } else {
        verifByLegacyWordId.set(v.word_id, v)
      }
    }
  }

  // Growing-DB REAL-PRICE lookup, scoped to this product class's corpus tag.
  // Constructed HERE (before the pin pre-step) so the pin override below can
  // reuse it; the unpinned corpus tier in Step 3 uses the SAME instance.
  // enabled=false (→ never fires) for any product class with no priced product-
  // class-tagged rows, guaranteeing byte-identical pricing for those classes.
  const corpusPrice = new CorpusPriceLookup(productClass)
  if (corpusPrice.enabled) {
    console.log(`[estimate] corpus real-price lookup ENABLED for class '${productClass}' (${corpusPrice.rowCount} priced corpus rows)`)
  } else {
    console.log(`[estimate] corpus real-price lookup disabled for class '${productClass}' (no priced product-class-tagged corpus rows) — class-anchor pricing unchanged`)
  }

  // ── Pre-step: emitter-pinned list_price_gbp → distributor_price_gbp ─────────
  // When a word has mod('list_price_gbp', '<N>') in modifier_characters, treat
  // that as an authoritative catalogue-pinned price and set distributor_price_gbp
  // directly in the partVerification row (creating the row if it doesn't exist).
  // This takes priority over Engine B's class curve (distributor_price_gbp is
  // checked before price_estimate_gbp at line 653). Motivation: the
  // enclosure_ventilation_fan_word (W2E200-HK38-01) oscillated £21→£35→£28→£35
  // across L28-L31 because Engine B set price_estimate_gbp=35 early, then the
  // skip guard prevented correction, and cost_repair left_as_is because the LLM
  // didn't flag a 3.8× discrepancy. The list_price_gbp modifier pins the Mouser
  // catalogue price (£133.78) in the emitter source so no downstream step can
  // drift it. Codified L31 council Fix 3 (2026-05-25).
  //
  // ── CORPUS PIN-OVERRIDE (2026-06-04) ─────────────────────────────────────
  // Many emitter pins are ROUNDED author guesses that collapse onto identical
  // values (CO₂: £2,400 ×5, £7,500 ×4, £4,200 ×4) and read as fabricated → the
  // BoM identical-price fingerprint fires (bom score stuck 4.50). When the SAME
  // pinned word carries a real manufacturer + MPN / strong name that THIS class's
  // harvested corpus CONFIDENTLY matches to a real unit_price_gbp (Grundfos CRNE
  // 5-5 £3,850, SEEPEX BN35-6L £6,000, Siemens S7-1500 £15k, Alfa Laval M6 …),
  // that sourced price OVERRIDES the rounded pin (growing-DB principle), tagged
  // engine_b_estimate_source='corpus_price' so the renderer treats it as a real
  // sourced price (price_sourced=true → excluded from the fingerprint). The
  // resolver reuses matchCorpusPrice UNCHANGED; a fabricated / no-MPN pin, or any
  // pin the corpus cannot confidently match, KEEPS its pin EXACTLY (the collateral-
  // damage guard). Scoping is byte-safe: corpusPrice.enabled=false for classes
  // with no priced co2-tag rows (BESS / wind) → resolvePin always keeps the pin.
  let listPricePinned = 0
  let pinCorpusOverridden = 0
  for (const m of state.moduleDecomposition?.modules ?? []) {
    for (const sm of m.sub_modules ?? []) {
      for (const w of sm.words ?? []) {
        const listPriceMod = (w.modifier_characters ?? []).find((mc: any) => mc.kind === 'list_price_gbp')
        if (!listPriceMod) continue
        const listPrice = parseFloat(String(listPriceMod.value))
        if (!isFinite(listPrice) || listPrice <= 0) continue
        const key = compoundKey(m.module, sm.id, w.id)
        const existing = verifByCompoundId.get(key) ?? verifByLegacyWordId.get(w.id)
        // The part's identity for the corpus pin-override: prefer the existing
        // verification row's mfr/MPN (carries any upstream enrichment), else read
        // the emitter modifier_characters. Needed in BOTH branches.
        const mfgMod = (w.modifier_characters ?? []).find((mc: any) => mc.kind === 'manufacturer')
        const pnMod = (w.modifier_characters ?? []).find((mc: any) => mc.kind === 'part_number')
        const pinMfr = existing?.manufacturer ?? (mfgMod ? String(mfgMod.value) : null)
        const pinPn = existing?.part_number ?? (pnMod ? String(pnMod.value) : null)
        // CORPUS PIN-OVERRIDE: a confident shared-manufacturer + MPN / strong-name
        // corpus match with a REAL unit_price_gbp replaces the rounded pin; no
        // confident match (incl. fabricated / no-MPN parts, disabled class) →
        // resolution.source stays 'emitter_list_price' → the pin is preserved
        // EXACTLY (byte-identical for non-co2 classes).
        const resolution = corpusPrice.resolvePin(listPrice, {
          word_name: w.name_human || w.id,
          manufacturer: pinMfr,
          part_number: pinPn,
        })
        const effectivePrice = resolution.price_gbp
        const corpusWon = resolution.source === 'corpus_price'
        if (corpusWon) pinCorpusOverridden++
        // Source tags: a corpus override renders as a real sourced price
        // (engine_b_estimate_source='corpus_price' → price_sourced=true → excluded
        // from the identical-price fingerprint); a kept pin renders exactly as it
        // did before this change ('emitter_list_price').
        const priceSourceTag = corpusWon ? 'corpus_price' : 'emitter_list_price'
        if (existing) {
          existing.distributor_price_gbp = effectivePrice
          existing.distributor_price_source = priceSourceTag
          // 2026-06-03 co2_mineralisation cost-undercount fix: ALSO populate
          // price_estimate_gbp so EVERY downstream reader sees the pinned
          // catalogue price, not just the ones that consult the distributor
          // field first. The cover cost-stack + cost_reality gate read
          // distributor_price_gbp → price_estimate_gbp; but the per-line price
          // plausibility gate (gate 21) reads cost_repair_corrected_price_gbp
          // ?? price_estimate_gbp ?? unit_price_gbp and never looks at
          // distributor_price_gbp — so a distributor-only pin was invisible to
          // it. Setting both keeps one authoritative number across all readers.
          existing.price_estimate_gbp = effectivePrice
          existing.price_estimate_source = priceSourceTag
          if (corpusWon) {
            // Render reads engine_b_estimate_source / engine_b_classification_source
            // === 'corpus_price' to mark the line price_sourced (fingerprint-skip).
            existing.engine_b_estimate_source = 'corpus_price'
            existing.engine_b_classification_source = 'corpus_price'
            existing.price_estimate_reasoning = `${resolution.corpus_match!.reason}. Real corpus price overrode the £${listPrice} emitter pin (growing-DB principle).`
          }
        } else {
          const newRow: any = {
            id: key,
            module: m.module,
            sub_module_id: sm.id,
            word_id: w.id,
            word_name: w.name_human || w.id,
            manufacturer: pinMfr,
            part_number: pinPn,
            status: 'verified',
            confidence: 'high',
            distributor_price_gbp: effectivePrice,
            distributor_price_source: priceSourceTag,
            // See note above: mirror onto price_estimate_gbp for universal
            // reader coverage (gate 21 et al. don't read distributor_price_gbp).
            price_estimate_gbp: effectivePrice,
            price_estimate_source: priceSourceTag,
            ...(corpusWon
              ? {
                  engine_b_estimate_source: 'corpus_price',
                  engine_b_classification_source: 'corpus_price',
                  price_estimate_reasoning: `${resolution.corpus_match!.reason}. Real corpus price overrode the £${listPrice} emitter pin (growing-DB principle).`,
                }
              : {}),
          }
          state.partVerifications.push(newRow)
          verifByCompoundId.set(key, newRow)
        }
        listPricePinned++
      }
    }
  }
  if (listPricePinned > 0) {
    console.log(`[estimate] pinned ${listPricePinned} parts from emitter list_price_gbp modifiers (bypasses Engine B curve)`)
  }
  if (pinCorpusOverridden > 0) {
    console.log(`[estimate] corpus pin-override: ${pinCorpusOverridden}/${listPricePinned} pinned parts re-priced from a confident real corpus match (rounded author pins replaced by sourced prices; non-matching pins preserved)`)
  }

  // Collect all targets that need estimates
  const targets: PartContext[] = []
  for (const m of state.moduleDecomposition?.modules ?? []) {
    for (const sm of m.sub_modules ?? []) {
      for (const w of sm.words ?? []) {
        const existing = verifByCompoundId.get(compoundKey(m.module, sm.id, w.id)) ?? verifByLegacyWordId.get(w.id)
        if (existingPartHasRealPrice(existing)) continue
        const qmod = (w.modifier_characters ?? []).find((mc: any) => mc.kind === 'quantity')
        let qty = 1
        if (qmod) {
          const numStr = String(qmod.value).replace(/[×x,\s]/g, '')
          const n = parseInt(numStr, 10)
          if (Number.isFinite(n) && n > 0) qty = n
        }
        const mfgMod = (w.modifier_characters ?? []).find((mc: any) => mc.kind === 'manufacturer')
        const pnMod = (w.modifier_characters ?? []).find((mc: any) => mc.kind === 'part_number')
        targets.push({
          word_id: w.id,
          word_name: w.name_human || w.id,
          module: m.module,
          sub_module_id: sm.id,
          manufacturer: existing?.manufacturer ?? (mfgMod ? String(mfgMod.value) : null),
          part_number: existing?.part_number ?? (pnMod ? String(pnMod.value) : null),
          description: existing?.reasoning ?? null,
          quantity: qty,
        })
      }
    }
  }

  console.log(`[estimate] ${targets.length} parts need price estimates`)
  if (targets.length === 0) {
    console.log('[estimate] nothing to do')
    // CRITICAL (2026-06-03 co2_mineralisation cost-undercount fix): the
    // emitter list_price_gbp pin pre-step above (lines ~997-1035) mutates
    // state.partVerifications (96 existing rows + 14 new rows for this run).
    // Those pins are a real side effect that the downstream cost-reality gate
    // and renderer MUST see. When EVERY word already carries a price (every
    // BoM word has a list_price_gbp modifier → targets.length === 0), the old
    // code returned here WITHOUT reaching the writeFileSync at the foot of
    // main(), so all 110 pins were silently dropped and cost_reality counted
    // only the handful of pre-existing distributor quotes (£21,923 of £690,491
    // for co2_mineralisation). Persist the pinned state before returning.
    if (write && listPricePinned > 0) {
      writeFileSync(statePath, JSON.stringify(state, null, 2))
      console.log(`[estimate] persisted ${listPricePinned} emitter list_price pins → ${statePath}`)
    } else if (!write) {
      console.log('[estimate] dry run; pass --write to persist any emitter list_price pins')
    }
    return
  }

  // -------------------------------------------------------------------------
  // Step 1 — corpus classification pass. Free, sub-millisecond per lookup.
  // -------------------------------------------------------------------------
  const corpus = new CorpusClassifier()
  // corpusPrice (the growing-DB REAL-PRICE lookup) is constructed earlier, just
  // before the pin pre-step, and reused here for the unpinned-target tier.
  const classByWordId = new Map<string, ComponentClass | 'unknown'>()
  const classSource = new Map<string, 'corpus' | 'flash_lite' | 'fallback' | 'db_cache' | 'rule_based'>()
  const needsClassify: PartContext[] = []

  for (const ctx of targets) {
    const cls = corpus.lookup(ctx.word_name)
    if (cls && cls !== 'unknown') {
      classByWordId.set(ctx.word_id, cls)
      classSource.set(ctx.word_id, 'corpus')
    } else {
      needsClassify.push(ctx)
    }
  }
  console.log(
    `[estimate] corpus-classified ${classByWordId.size}/${targets.length}; ${needsClassify.length} need rule-based / Flash-Lite`,
  )

  // -------------------------------------------------------------------------
  // Step 1b — C4 deterministic rule-based classifier for corpus misses.
  // Zero LLM calls, fully deterministic. Runs before Flash-Lite so the LLM
  // only sees the residual parts that cannot be classified by rules.
  // Invariant: smoke/detector/chiller/hvac keywords NEVER return oem_subsystem.
  // -------------------------------------------------------------------------
  const stillNeedsFlashLite: PartContext[] = []
  let ruleClassifiedCount = 0
  for (const ctx of needsClassify) {
    const ruled = classifyByRules(ctx)
    if (ruled) {
      classByWordId.set(ctx.word_id, ruled)
      classSource.set(ctx.word_id, 'rule_based')
      ruleClassifiedCount += 1
    } else {
      stillNeedsFlashLite.push(ctx)
    }
  }
  console.log(
    `[estimate] rule-based classified ${ruleClassifiedCount} parts; ${stillNeedsFlashLite.length} still need Flash-Lite`,
  )

  // -------------------------------------------------------------------------
  // Step 2 — on-the-fly classify remaining via Flash-Lite (batches of 20).
  // Flash-Lite now only handles the genuinely unrecognisable residual.
  // -------------------------------------------------------------------------
  const BATCH = 20
  const batches: Array<Array<{ ctx: PartContext }>> = []
  for (let i = 0; i < stillNeedsFlashLite.length; i += BATCH) {
    batches.push(stillNeedsFlashLite.slice(i, i + BATCH).map((ctx) => ({ ctx })))
  }
  if (batches.length > 0) {
    let done = 0
    await new Promise<void>((resolveAll) => {
      let inFlight = 0
      let nextIdx = 0
      const tick = () => {
        while (inFlight < CONCURRENCY && nextIdx < batches.length) {
          const batch = batches[nextIdx++]
          inFlight += 1
          classifyOnTheFly(batch).then((map) => {
            for (const [wid, cls] of map.entries()) {
              classByWordId.set(wid, cls)
              classSource.set(wid, 'flash_lite')
            }
            done += 1
            inFlight -= 1
            if (done === batches.length) resolveAll()
            else tick()
          })
        }
      }
      tick()
    })
    console.log(`[estimate] Flash-Lite classified ${batches.length} batches`)
  }

  // Any targets that still don't have a class get 'unknown' fallback.
  for (const ctx of targets) {
    if (!classByWordId.has(ctx.word_id)) {
      classByWordId.set(ctx.word_id, 'unknown')
      classSource.set(ctx.word_id, 'fallback')
    }
  }

  // -------------------------------------------------------------------------
  // Step 3 — compute estimates. For known classes use the curve (free).
  // For 'unknown' classes use Flash-Lite with the new volume-aware prompt.
  // -------------------------------------------------------------------------
  const results: Array<{ ctx: PartContext; estimate: PriceEstimate | null }> = []
  const unknowns: PartContext[] = []

  // C3 — DB cache lookup counter for reporting
  let dbCacheHits = 0
  let finishedCommodityCount = 0
  for (const ctx of targets) {
    // ── C3 PRICING GATEWAY: cache-first (2026-05-28, BLOCKER) ───────────────
    // Before any estimate path, check the local SQLite cache in forge-truth.db
    // (table distributor_cascade_cache). lookupCached reads ONLY the local DB —
    // no live API calls (CHAIN-AS-DB-CONSUMER PRINCIPLE). The cache is populated
    // by scripts/ingest/* jobs on a schedule independent of chain runs.
    //
    // Fallback order (canonical per PLAN-deterministic-generation.md C3):
    //   1. emitter list_price_gbp pin  ← already handled in pre-step above
    //   2. DB cache hit (this block)   ← C3
    //   3. Curated industrial table    ← existing INTERIM table
    //   4. Curve estimate (Engine B)   ← fallback
    //
    // Only attempt the cache lookup when the part has a real MPN (≥4 chars,
    // not a placeholder). The manufacturer is passed as a fuzzy hint; a null
    // manufacturer still queries on MPN alone.
    const mpn = ctx.part_number ? String(ctx.part_number).trim() : ''
    const hasMpn = mpn.length >= 4 && !/^(tbd|tba|n\/a|custom|generic|placeholder)/i.test(mpn)
    if (hasMpn) {
      const cached = lookupCached(ctx.manufacturer, mpn)
      if (cached.found && cached.result && cached.source === 'cache_hit') {
        // Extract a GBP price from the DistributorResult. priceGBP is an array
        // of {quantity, unitPrice} break-points; use the lowest-quantity break
        // (quantity = 1 or the smallest available) as the representative price.
        const priceBreaks = cached.result.priceGBP ?? []
        let unitPriceGbp: number | null = null
        if (priceBreaks.length > 0) {
          // Sort ascending by qty, pick first non-zero price.
          const sorted = [...priceBreaks].sort((a, b) => a.qty - b.qty)
          for (const pb of sorted) {
            if (typeof pb.unitPriceGbp === 'number' && pb.unitPriceGbp > 0) {
              unitPriceGbp = pb.unitPriceGbp
              break
            }
          }
        }
        if (unitPriceGbp && unitPriceGbp > 0) {
          dbCacheHits += 1
          const cls = classByWordId.get(ctx.word_id) ?? 'unknown'
          results.push({
            ctx,
            estimate: {
              price_estimate_gbp: round2(unitPriceGbp),
              estimate_low_gbp: round2(unitPriceGbp * 0.85),
              estimate_high_gbp: round2(unitPriceGbp * 1.20),
              reasoning: `C3 DB cache hit (distributor_cascade_cache, age ${Math.round(cached.ageHours ?? 0)}h): ${cached.result.source ?? 'unknown'} price £${unitPriceGbp} for ${ctx.manufacturer ?? '?'} ${mpn}`,
              component_class: cls,
              curve_multiplier: 1.0,
              reference_unit_cost_gbp: unitPriceGbp,
              annual_volume: annualVolume,
              classification_source: 'db_cache',
              estimate_source: 'db_cache',
            },
          })
          continue
        }
      }
      // library_only source: part is real but no pricing data — fall through
      // to curated/curve for the price, but log the confirmed-real status.
    }

    // ── CORPUS REAL-PRICE (2026-06-04): growing-DB pricing primary ───────────
    // Fallback order (canonical, extended): 1. emitter list_price pin (pre-step)
    // → 2. DB cascade cache (above) → 3. CORPUS real price (this block) →
    // 4. curated industrial table → 5. Engine-B curve. The corpus carries real
    // per-part `unit_price_gbp` harvested for THIS product class (e.g. the 90
    // CO₂ parts at doc 1213); preferring those over the class anchor breaks the
    // many-distinct-parts-at-one-price collapse and gives a £60k boiler its real
    // price. Only fires on a CONFIDENT manufacturer + MPN / strong-name match
    // (matchCorpusPrice); no match → falls through unchanged.
    const corpusMatch = corpusPrice.lookup(ctx)
    // Reject only a genuinely corrupt corpus figure (≤0 or absurdly large) — a
    // data-entry error, not a real price. Critically we do NOT clamp to the
    // per-class sanity band: that band is calibrated for ESTIMATES (a generic
    // thermal cold-plate caps at £15k), but a corpus match is a REAL SOURCED
    // price that is its own ground truth — clamping a real £35k process boiler
    // down to the £15k generic-thermal ceiling is exactly the wrong-anchor bug
    // this fix removes (Tristan 2026-06-04: the boiler must keep its real price).
    // CORPUS_PRICE_ABSURD_MAX_GBP is the shared module-level constant (also used
    // by the pin-override resolver) — same corrupt-figure ceiling for both tiers.
    if (corpusMatch && corpusMatch.unit_price_gbp > 0 && corpusMatch.unit_price_gbp <= CORPUS_PRICE_ABSURD_MAX_GBP) {
      const cls = classByWordId.get(ctx.word_id) ?? 'unknown'
      const priced = corpusMatch.unit_price_gbp
      results.push({
        ctx,
        estimate: {
          price_estimate_gbp: round2(priced),
          estimate_low_gbp: round2(priced * 0.85),
          estimate_high_gbp: round2(priced * 1.20),
          reasoning: `Engine B ${corpusMatch.reason}. Real corpus price used instead of the class anchor (growing-DB principle).`,
          component_class: cls,
          curve_multiplier: 1.0,
          reference_unit_cost_gbp: corpusMatch.unit_price_gbp,
          annual_volume: annualVolume,
          classification_source: 'corpus_price',
          estimate_source: 'corpus_price',
        },
      })
      continue
    }

    // 2026-05-28 INTERIM: curated real catalogue price for cascade-miss
    // industrial OEM parts (Beckhoff/Anybus/Phoenix/Grundfos/…), consulted
    // BEFORE the Engine-B curve so they stop rendering at the ~£10k / ~£35
    // curve-reference errors the L56 council flagged. Tagged 'curve' so batch
    // economics treats it as already-anchored (no W3 re-scale).
    const curated = curatedIndustrialPrice(ctx.manufacturer, ctx.part_number)
    if (curated) {
      results.push({
        ctx,
        estimate: {
          price_estimate_gbp: curated.price_gbp,
          estimate_low_gbp: round2(curated.price_gbp * 0.8),
          estimate_high_gbp: round2(curated.price_gbp * 1.25),
          reasoning: `Curated industrial catalogue price (interim, pre-DB-ingest): ${curated.note} = £${curated.price_gbp}. Part missed the distributor cascade; this real price replaces the Engine-B curve estimate.`,
          component_class: classByWordId.get(ctx.word_id) ?? 'unknown',
          curve_multiplier: 1.0,
          reference_unit_cost_gbp: curated.price_gbp,
          annual_volume: annualVolume,
          classification_source: classSource.get(ctx.word_id) ?? 'curated',
          estimate_source: 'curve',
        },
      })
      continue
    }
    const cls = classByWordId.get(ctx.word_id)
    // 2026-05-31 (multi-class sweep): a part whose word_id never landed in
    // classByWordId (classification partially failed — seen on auv / haps /
    // ev-charger) yields `undefined`, not 'unknown'. The old `!` assertion +
    // `=== 'unknown'` check let undefined slip through into curveEstimateFor ->
    // COMPONENT_CURVES[undefined].curve -> TypeError that crashed ALL of Engine B
    // (the whole BoM then shipped UNPRICED -> council BOM score 5.3). Treat an
    // unclassified part as an unknown (handled by the unknowns path below).
    if (!cls || cls === 'unknown') {
      unknowns.push(ctx)
      continue
    }
    const c = curveEstimateFor(cls, annualVolume, productClass, {
      name: ctx.word_name,
      manufacturer: ctx.manufacturer,
      part_number: ctx.part_number,
    })
    // ITER-10.5 Sprint 1A (Tristan 2026-05-20): finished commodities
    // (catalogue items bought from a real manufacturer — CIMC container,
    // Copeland compressor, Bosch Rexroth rail) skip the production-scale
    // curve discount. They're priced at retail catalogue, not at our
    // 1000-unit fab volume. Universal across every product class.
    const finished = isFinishedCommodity(ctx)
    const finalCentral = finished ? c.reference : c.central
    const finalLow = finished ? round2(c.reference * 0.7) : c.low
    const finalHigh = finished ? round2(c.reference * 1.3) : c.high
    const finalMultiplier = finished ? 1.0 : c.multiplier
    if (finished) finishedCommodityCount += 1
    results.push({
      ctx,
      estimate: {
        price_estimate_gbp: finalCentral,
        estimate_low_gbp: finalLow,
        estimate_high_gbp: finalHigh,
        reasoning: finished
          ? `Engine B finished-commodity: class=${cls}, manufacturer=${ctx.manufacturer}, SKU=${ctx.part_number}, reference £${c.reference} (no production-scale discount applied — catalogue item)${c.sanity_note ? `; ${c.sanity_note}` : ''}`
          : c.sanity_note
            ? `Engine B curve${c.class_ceiling_note ? ' + class ceiling' : c.keyword_ceiling_note ? ' + keyword ceiling' : c.keyword_floor_note ? ' + keyword floor' : ''}: class=${cls}, annual_volume=${annualVolume.toLocaleString()}, reference £${c.reference} → £${c.central}; ${c.sanity_note}`
            : c.class_ceiling_note
              ? `Engine B curve + U1 class ceiling: class=${cls}, annual_volume=${annualVolume.toLocaleString()}, reference £${c.reference} × ${c.multiplier.toFixed(3)} capped by class ceiling to £${c.central} (${c.class_ceiling_note})`
              : c.keyword_ceiling_note
                ? `Engine B curve + category keyword ceiling: class=${cls}, annual_volume=${annualVolume.toLocaleString()}, reference £${c.reference} × ${c.multiplier.toFixed(3)} capped DOWN to £${c.central} (${c.keyword_ceiling_note})`
                : c.keyword_floor_note
                  ? `Engine B curve + category keyword floor: class=${cls}, annual_volume=${annualVolume.toLocaleString()}, reference £${c.reference} × ${c.multiplier.toFixed(3)} clamped UP to £${c.central} (${c.keyword_floor_note})`
                  : `Engine B curve: class=${cls}, annual_volume=${annualVolume.toLocaleString()}, reference £${c.reference}, multiplier ${c.multiplier.toFixed(3)} → £${c.central}`,
        component_class: cls,
        curve_multiplier: finalMultiplier,
        reference_unit_cost_gbp: c.reference,
        annual_volume: annualVolume,
        classification_source: classSource.get(ctx.word_id)!,
        estimate_source: 'curve',
        price_class_ceiling_clamped: c.class_ceiling_clamped || undefined,
        price_class_ceiling_note: c.class_ceiling_note,
        price_sanity_clamped: c.sanity_clamped || undefined,
        price_sanity_note: c.sanity_note,
      },
    })
  }
  if (finishedCommodityCount > 0) {
    console.log(`[estimate] ${finishedCommodityCount} parts identified as finished commodities — curve discount skipped (priced at reference)`)
  }

  // Flash-Lite for unknowns (concurrency 8).
  if (unknowns.length > 0) {
    console.log(`[estimate] Flash-Lite (volume-aware) for ${unknowns.length} 'unknown' parts`)
    let done = 0
    await new Promise<void>((resolveAll) => {
      let inFlight = 0
      let nextIdx = 0
      const tick = () => {
        while (inFlight < CONCURRENCY && nextIdx < unknowns.length) {
          const ctx = unknowns[nextIdx++]
          inFlight += 1
          // 2026-05-21 (Tristan BESS forensic): small-commodity keyword
          // pre-filter. If the part name matches a known small-commodity
          // tier (fastener, tap wire, small bracket, cable clip, etc.),
          // skip the Flash-Lite call entirely and use the deterministic
          // floor. Saves an LLM call and prevents Flash-Lite from
          // returning £128 for what should be a £2 wire. Cost Repair
          // can still correct upward later if a real high-priced item
          // matched the pattern.
          const smallFloor = trySmallCommodityFloor(ctx, annualVolume)
          if (smallFloor) {
            results.push({
              ctx,
              estimate: {
                price_estimate_gbp: round2(smallFloor.unit_gbp),
                estimate_low_gbp: round2(smallFloor.unit_gbp * 0.5),
                estimate_high_gbp: round2(smallFloor.unit_gbp * 2),
                reasoning: `Engine B small-commodity pre-filter: ${smallFloor.reason}`,
                component_class: 'unknown',
                curve_multiplier: 0,
                reference_unit_cost_gbp: 0,
                annual_volume: annualVolume,
                classification_source: classSource.get(ctx.word_id)!,
                estimate_source: 'flash_lite_unknown_class',
              },
            })
            done += 1
            inFlight -= 1
            if (done === unknowns.length) resolveAll()
            else tick()
            continue
          }
          estimatePriceForUnknown(ctx, productClass, annualVolume).then((e) => {
            if (e) {
              results.push({
                ctx,
                estimate: {
                  price_estimate_gbp: round2(e.central),
                  estimate_low_gbp: round2(e.low),
                  estimate_high_gbp: round2(e.high),
                  reasoning: `Engine B fallback (unknown class): ${e.reasoning}`,
                  component_class: 'unknown',
                  curve_multiplier: 0,
                  reference_unit_cost_gbp: 0,
                  annual_volume: annualVolume,
                  classification_source: classSource.get(ctx.word_id)!,
                  estimate_source: 'flash_lite_unknown_class',
                },
              })
            } else {
              results.push({ ctx, estimate: null })
            }
            done += 1
            inFlight -= 1
            if (done === unknowns.length) resolveAll()
            else tick()
          })
        }
      }
      tick()
    })
  }

  corpus.close()
  corpusPrice.close()

  // -------------------------------------------------------------------------
  // Step 4 — write back into state.partVerifications.
  // -------------------------------------------------------------------------
  let updated = 0
  let synthesised = 0
  const bySource = { corpus: 0, flash_lite: 0, fallback: 0, curated: 0, db_cache: 0, rule_based: 0, corpus_price: 0 }
  const byEstimate = { curve: 0, flash_lite_unknown_class: 0, db_cache: 0, corpus_price: 0 }
  const classCounts: Record<string, number> = {}

  for (const { ctx, estimate } of results) {
    if (!estimate) continue
    // 2026-05-19 fix C1: lookup by compound key (module::sub_module::word) with
    // legacy bare word_id as fallback. Prevents cross-module overwrite.
    const existing = verifByCompoundId.get(compoundKey(ctx.module, ctx.sub_module_id, ctx.word_id))
      ?? verifByLegacyWordId.get(ctx.word_id)
    bySource[estimate.classification_source]! += 1
    byEstimate[estimate.estimate_source]! += 1
    classCounts[estimate.component_class] = (classCounts[estimate.component_class] || 0) + 1

    const enriched = {
      price_estimate_gbp: estimate.price_estimate_gbp,
      price_estimate_low_gbp: estimate.estimate_low_gbp,
      price_estimate_high_gbp: estimate.estimate_high_gbp,
      price_estimate_reasoning: estimate.reasoning,
      price_estimate_model: estimate.estimate_source === 'db_cache'
        ? 'distributor_cascade_cache'
        : estimate.estimate_source === 'curve'
          ? 'engine-b-curve'
          : 'google/gemini-3.1-flash-lite-preview',
      // Engine B attribution columns (new).
      engine_b_component_class: estimate.component_class,
      engine_b_curve_multiplier: estimate.curve_multiplier,
      engine_b_reference_unit_cost_gbp: estimate.reference_unit_cost_gbp,
      engine_b_annual_volume: estimate.annual_volume,
      engine_b_classification_source: estimate.classification_source,
      engine_b_estimate_source: estimate.estimate_source,
      // U1 class ceiling attribution (undefined when not clamped — omitted from JSON)
      ...(estimate.price_class_ceiling_clamped ? { price_class_ceiling_clamped: true } : {}),
      ...(estimate.price_class_ceiling_note ? { price_class_ceiling_note: estimate.price_class_ceiling_note } : {}),
      // C5 sanity clamp attribution (undefined when not clamped — omitted from JSON)
      ...(estimate.price_sanity_clamped ? { price_sanity_clamped: true } : {}),
      ...(estimate.price_sanity_note ? { price_sanity_note: estimate.price_sanity_note } : {}),
    }

    if (existing) {
      Object.assign(existing, enriched)
      updated += 1
    } else {
      state.partVerifications.push({
        id: `${ctx.module}::${ctx.sub_module_id}::${ctx.word_id}`,
        module: ctx.module,
        sub_module_id: ctx.sub_module_id,
        word_id: ctx.word_id,
        word_name: ctx.word_name,
        manufacturer: ctx.manufacturer,
        part_number: ctx.part_number,
        status: 'uncertain',
        confidence: 'low',
        reasoning: estimate.reasoning,
        source_method: 'estimate',
        generated_at: new Date().toISOString(),
        generated_by: 'estimate-missing-prices.tsx (Engine B)',
        ...enriched,
      })
      synthesised += 1
    }
  }

  const noEstimate = results.filter((r) => !r.estimate).length
  const sanityClamped = results.filter((r) => r.estimate?.price_sanity_clamped).length
  console.log(
    `[estimate] updated ${updated} existing, synthesised ${synthesised} new, ${noEstimate} failed`,
  )
  if (dbCacheHits > 0) {
    console.log(`[estimate] C3 DB cache: ${dbCacheHits} parts priced from distributor_cascade_cache (0 live API calls)`)
  } else {
    console.log(`[estimate] C3 DB cache: 0 hits — run scripts/ingest/* to populate the cache for better pricing accuracy`)
  }
  if (sanityClamped > 0) {
    console.log(`[estimate] C5 sanity clamp: ${sanityClamped} parts clamped to class sanity band (check price_sanity_note in partVerifications)`)
  }
  console.log(`[estimate] classification source: corpus=${bySource.corpus} rule_based=${ruleClassifiedCount} flash_lite=${bySource.flash_lite} fallback=${bySource.fallback} curated=${bySource.curated} db_cache=${bySource.db_cache ?? 0}`)
  console.log(`[estimate] estimate source: db_cache=${byEstimate.db_cache ?? 0} curve=${byEstimate.curve} flash_lite_unknown=${byEstimate.flash_lite_unknown_class}`)
  const top = Object.entries(classCounts).sort((a, b) => b[1] - a[1]).slice(0, 8)
  console.log('[estimate] top classes in BoM:')
  for (const [k, v] of top) console.log(`  ${k}: ${v}`)

  // Engine B cost: ~£0.0003 per Flash-Lite classify batch + ~£0.0006 per
  // unknown-class fallback. Rough estimate.
  const classifyBatchCost = batches.length * 0.0003
  const unknownFallbackCost = unknowns.length * 0.0006
  const totalGbp = (classifyBatchCost + unknownFallbackCost) * 0.78
  logCost(`estimate-missing-prices | ${targets.length} parts, ${results.length} results, ${updated + synthesised} written | est GBP ${totalGbp.toFixed(3)}`)
  console.log(`[estimate] estimated cost: GBP ${totalGbp.toFixed(3)}`)

  if (write) {
    writeFileSync(statePath, JSON.stringify(state, null, 2))
    console.log(`[estimate] wrote → ${statePath}`)
  } else {
    console.log('[estimate] dry run; pass --write to persist')
  }
}

// proveCatch (2026-07-21): the device-commodity ceilings must be realistic for a benchtop
// instrument (the organoid £25×9-default over-pricing) WITHOUT under-pricing a genuinely
// pricier commodity (the CP30238 £28 Peltier lesson). Off an instrument device it is a strict
// no-op (undefined). Run: npx tsx scripts/estimate-missing-prices.tsx --selftest
function _deviceCeilingSelftest(): number {
  let bad = 0
  const check = (name: string, cond: boolean) => { if (!cond) { console.error(`  FAIL ${name}`); bad++ } }
  RUN_IS_INSTRUMENT_DEVICE = false
  check('off-instrument is a strict no-op', deviceScaleCeilingGbp('sensor', 'Temperature Sensor') === undefined)
  RUN_IS_INSTRUMENT_DEVICE = true
  // cheap device commodities clamp LOW (were £25/£30)
  check('thermal interface pad ≤5', (deviceScaleCeilingGbp('', 'Thermal Interface Pad') ?? 99) <= 5)
  check('heatsink fan ≤10', (deviceScaleCeilingGbp('', 'Heatsink Fan') ?? 99) <= 10)
  check('cartridge heater ≤12', (deviceScaleCeilingGbp('', 'Cartridge Heater') ?? 99) <= 12)
  check('stir tachometer ≤8', (deviceScaleCeilingGbp('sensor', 'Stir Tachometer') ?? 99) <= 8)
  check('temperature sensor ≤12 (was 25)', (deviceScaleCeilingGbp('sensor', 'Culture Temperature Probe') ?? 99) <= 12)
  check('generic device part ≤15 (was 30)', (deviceScaleCeilingGbp('', 'Some Bracket') ?? 99) <= 15)
  // pricier commodities must NOT be under-priced
  check('Peltier/TEC stays ≥30 (not under-priced)', (deviceScaleCeilingGbp('', 'Peltier TEC Module') ?? 0) >= 30)
  check('peristaltic pump stays ≥35', (deviceScaleCeilingGbp('', 'Dosing Peristaltic Pump') ?? 0) >= 35)
  check('optical stays ≥40', (deviceScaleCeilingGbp('optical', 'OD Photodiode') ?? 0) >= 40)
  check('controller PCB stays ≥55', (deviceScaleCeilingGbp('electronic_pcb', 'Main Board') ?? 0) >= 55)
  RUN_IS_INSTRUMENT_DEVICE = false
  if (bad === 0) console.log('estimate-missing-prices device-ceiling --selftest OK (device commodities realistic; pricier parts not under-priced; off-instrument no-op)')
  return bad
}

// Only auto-run as a CLI; guarded so the module can be imported (e.g. by the
// regression harness, which exercises classifyByRules) without executing main().
if ((process.argv[1] ?? '').includes('estimate-missing-prices')) {
  if (process.argv.includes('--selftest')) {
    process.exit(_deviceCeilingSelftest() === 0 ? 0 : 1)
  }
  main().catch((err) => {
    console.error('[estimate] fatal:', err)
    process.exit(1)
  })
}
