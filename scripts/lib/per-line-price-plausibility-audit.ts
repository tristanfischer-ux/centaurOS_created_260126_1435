/**
 * Per-line BoM price plausibility audit — gate 21 (codified 2026-05-25,
 * BESS L22 council universal-fix #5).
 *
 * Universal across every product class that emits real industrial parts in
 * its BoM with a priced unit_price_gbp line item.
 *
 * Root cause it addresses: the chain's aggregate cost check (gate 10 B-7)
 * verifies the TOTAL BoM is within an industry band for the class. But
 * individual line items can be wildly mispriced while the total stays in
 * band — one £18 connector rendered at £180, offset by a £3 000 string
 * inverter rendered at £30. Errors cancel in the aggregate total but the
 * BoM is rubbish per-line. Gate 21 closes that gap: for each BoM line that
 * has a positive rendered unit price AND a resolvable MPN, it hits the live
 * distributor cascade and flags any price outside [0.3×, 3.0×] of the
 * cheapest real distributor source.
 *
 * Severity ladder:
 *   HIGH — ratio > 5 (massive over-bill) OR ratio < 0.2
 *          (massive under-bill, possible currency confusion or stale data).
 *          Chain fails fast on any HIGH finding.
 *   MEDIUM — ratio in [3, 5] or in [0.2, 0.33]. Outside the 3× plausibility
 *            band but not catastrophic. Informational + logged.
 *   LOW — ratio in [2, 3] or in [0.33, 0.5]. Borderline — informational,
 *         no chain-fail. Surfaces for operator awareness.
 *   PASS — ratio in [0.5, 2]. Acceptable.
 *
 * The 0.5 lower bound matters: a BoM price below 0.5× the cheapest
 * distributor source at qty=1 is suspicious — it may reflect a bulk-
 * quantity price mistakenly applied to a qty=1 BoM line, a stale catalogue
 * price from a superseded catalogue year, or a currency conversion error
 * (e.g. USD used as GBP).
 *
 * Distinct from gate 10 B-4 (class-specific minimum-unit-price floors):
 * B-4 uses a HARDCODED table of known bad floor values per class
 * (e.g. "wind blade ≥ £1M"). Gate 21 uses LIVE distributor prices — no
 * table maintenance required, automatically adapts to any product class and
 * any part, catches any ratio error regardless of magnitude direction.
 *
 * Distinct from gate 10 B-7 (total-cost plausibility band): B-7 checks
 * whether the ENTIRE BoM total / output-unit falls within an industry band.
 * Gate 21 operates per-line — the two gates are orthogonal.
 *
 * Nexar quota conservation: Nexar Evaluation plan = 100 matched
 * parts/MONTH. Mouser = 1000/day, Digi-Key = 1000/day after OAuth,
 * Farnell = free, LCSC = free. This audit defaults to the four native
 * distributors in parallel. ONLY if all four miss does it fall back to
 * Nexar — preventing unnecessary burn on the scarce monthly quota. Note:
 * if the MPN returns zero distributor hits (all miss), gate 20 would already
 * have flagged it as potentially fictional. Gate 21 skips that line — nothing
 * to compare against.
 *
 * Concurrency: a semaphore limits fan-out to 3 parallel cascade lookups at
 * a time. Each individual distributor call is capped at 8 s via Promise.race
 * — safe in CLI tsx context.
 *
 * Pre-change mempalace search: per-line BoM price plausibility distributor
 * cascade BESS L22 gate 10 B-7 total cost → 0 drawers loaded.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ── DISTRIBUTOR IMPORTS ──────────────────────────────────────────────────────
// 4-native-first, Nexar-last-resort cascade that conserves the 100
// matched-parts/month Nexar Evaluation-plan quota.
const distDir = resolve(__dirname, '../../src/lib/pdf-engine-v2/lib/distributors')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { lookupSkuMouser } = require(resolve(distDir, 'mouser')) as typeof import('../../src/lib/pdf-engine-v2/lib/distributors/mouser')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { lookupSkuDigikey } = require(resolve(distDir, 'digikey')) as typeof import('../../src/lib/pdf-engine-v2/lib/distributors/digikey')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { lookupSkuFarnell } = require(resolve(distDir, 'farnell')) as typeof import('../../src/lib/pdf-engine-v2/lib/distributors/farnell')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { lookupSkuLcsc } = require(resolve(distDir, 'lcsc')) as typeof import('../../src/lib/pdf-engine-v2/lib/distributors/lcsc')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { lookupSkuNexar } = require(resolve(distDir, 'nexar')) as typeof import('../../src/lib/pdf-engine-v2/lib/distributors/nexar')

// ── COMMODITY / SKIP PATTERNS ────────────────────────────────────────────────
// Same regex as gate 20 — commodity descriptors are not findable via exact
// MPN search in any distributor, so we cannot compute a meaningful ratio.
// Flagging them would be noise (e.g. "M6 bolt" returns thousands of results;
// the qty-1 price of the cheapest M6 fastener is meaningless as a benchmark
// for a high-volume structural fastener order).
const COMMODITY_SKIP_REGEX = /^(?:M\d{1,2}(?:\.\d)?\s*(?:x\s*\d+)?|generic|standard|n\/?a|tbd|various|custom|bespoke|oem|\d{1,4}mm?\s*(?:angle|plate|rod|tube|pipe|cable|wire|bracket|channel|gland|trunking)?|\d+(?:\.\d+)?\s*(?:A|V|W|kW|kVA|kWh|MWh|Hz|mm|m|kg)\s*[-_/]?\s*\w*)$/i

// Short alphanumeric (≤4 chars) — too ambiguous to reliably identify at
// a distributor. The qty-1 price returned for a 4-char token would be
// unreliable as a benchmark.
const SHORT_ALPHANUMERIC_REGEX = /^[A-Za-z0-9]{1,4}$/

// ── TIMEOUT HELPER ───────────────────────────────────────────────────────────

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T | null> {
  const abort = new AbortController()
  const timer = setTimeout(
    () => abort.abort(new Error(`[per-line-price-audit] ${label} timed out after ${ms}ms`)),
    ms,
  )
  try {
    const result = await promise
    clearTimeout(timer)
    return result
  } catch {
    clearTimeout(timer)
    return null
  }
}

// ── PRICE LOOKUP ─────────────────────────────────────────────────────────────
//
// Two-stage cascade to protect Nexar quota:
//   Stage 1: parallel Mouser + Digi-Key + Farnell + LCSC (cheap)
//   Stage 2: Nexar only if all four native distributors miss
//
// Returns the qty-1 unit price (GBP) from every distributor that hit,
// plus which source was cheapest.

interface PriceLookupResult {
  /** All qty-1 unit prices from distributors that returned a match. */
  pricesGbp: Array<{ source: string; unitPriceGbp: number }>
  nexar_tried: boolean
}

function qty1Price(row: { priceGBP?: Array<{ qty: number; unitPriceGbp: number }> } | null): number | null {
  if (!row?.priceGBP || row.priceGBP.length === 0) return null
  const sorted = [...row.priceGBP].sort((a, b) => a.qty - b.qty)
  const p = sorted[0].unitPriceGbp
  return Number.isFinite(p) && p > 0 ? p : null
}

function mfrCompatible(
  row: { manufacturer?: string } | null,
  declaredManufacturer: string | null,
): boolean {
  if (!row) return false
  if (!declaredManufacturer?.trim()) return true
  const decl = declaredManufacturer.trim().toLowerCase()
  const rowMfr = (row.manufacturer ?? '').toLowerCase()
  if (!rowMfr) return true
  return rowMfr.includes(decl) || decl.includes(rowMfr)
}

async function priceCascadeLookup(
  mpn: string,
  manufacturer: string | null,
): Promise<PriceLookupResult> {
  const TIMEOUT_MS = 8_000

  const [m, d, f, l] = await Promise.all([
    withTimeout(lookupSkuMouser(mpn).catch(() => null), TIMEOUT_MS, `mouser:${mpn}`),
    withTimeout(lookupSkuDigikey(mpn).catch(() => null), TIMEOUT_MS, `digikey:${mpn}`),
    withTimeout(lookupSkuFarnell(mpn).catch(() => null), TIMEOUT_MS, `farnell:${mpn}`),
    withTimeout(lookupSkuLcsc(mpn).catch(() => null), TIMEOUT_MS, `lcsc:${mpn}`),
  ])

  const pricesGbp: Array<{ source: string; unitPriceGbp: number }> = []

  function tryAdd(source: string, row: Parameters<typeof mfrCompatible>[0]): void {
    if (!mfrCompatible(row, manufacturer)) return
    const p = qty1Price(row as any)
    if (p !== null) pricesGbp.push({ source, unitPriceGbp: p })
  }

  tryAdd('mouser', m)
  tryAdd('digikey', d)
  tryAdd('farnell', f)
  tryAdd('lcsc', l)

  if (pricesGbp.length > 0) {
    return { pricesGbp, nexar_tried: false }
  }

  // Stage 2: Nexar last resort
  const n = await withTimeout(lookupSkuNexar(mpn).catch(() => null), TIMEOUT_MS, `nexar:${mpn}`)
  tryAdd('nexar', n)

  return { pricesGbp, nexar_tried: true }
}

// ── SEMAPHORE ────────────────────────────────────────────────────────────────

async function runWithSemaphore<T>(
  semaphore: { slots: number },
  fn: () => Promise<T>,
): Promise<T> {
  while (semaphore.slots <= 0) {
    await new Promise((res) => setTimeout(res, 50))
  }
  semaphore.slots -= 1
  try {
    return await fn()
  } finally {
    semaphore.slots += 1
  }
}

// ── MEDIAN HELPER ────────────────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

// ── BoM LINE EXTRACTION ───────────────────────────────────────────────────────
//
// Primary source: state.partVerifications — this array has the final rendered
// unit_price_gbp (after cost-repair passes) PLUS the MPN + manufacturer that
// was presented in the BoM. This is the price a procurement engineer would
// see on the document.
//
// Secondary source (quantity): the module-decomposition tree's
// modifier_characters[kind=quantity] for the word_id. Gate 21 uses quantity
// only to skip zero-quantity deleted lines. A missing quantity is treated as
// present (non-zero) — erring on the side of checking the line.

interface BomPriceLine {
  word_id: string
  word_name: string
  part_number: string
  manufacturer: string | null
  unit_price_gbp: number
  module_id: string
  sub_module_id: string
}

function collectBomPriceLines(state: any): BomPriceLine[] {
  const out: BomPriceLine[] = []

  // Build a quick lookup of word_id → quantity from the module tree so we can
  // skip zero-quantity (deleted) lines.
  const quantityByWordId = new Map<string, number>()
  const modules: any[] =
    state?.moduleDecomposition?.modules ??
    state?.module_decomposition?.modules ??
    state?.modules ??
    []
  for (const mod of modules) {
    const subs: any[] = Array.isArray(mod?.sub_modules)
      ? mod.sub_modules
      : Array.isArray(mod?.submodules)
        ? mod.submodules
        : []
    for (const sm of subs) {
      const wordArrays: any[][] = [sm?.words, sm?.components, sm?.parts, sm?.items]
      for (const wa of wordArrays) {
        if (!Array.isArray(wa)) continue
        for (const w of wa) {
          if (!w || typeof w !== 'object') continue
          const wid = String(w?.id ?? w?.content_character?.character_id ?? '')
          if (!wid) continue
          const mods: Array<{ kind: string; value: string }> = Array.isArray(w?.modifier_characters)
            ? w.modifier_characters
            : []
          const qtyMod = mods.find((x) => x.kind === 'quantity')
          const qty = qtyMod && typeof qtyMod.value === 'string'
            ? parseFloat(qtyMod.value.replace(/[^0-9.]/g, ''))
            : typeof w?.quantity === 'number' ? w.quantity : null
          if (Number.isFinite(qty)) {
            quantityByWordId.set(wid, qty as number)
          }
        }
      }
    }
  }

  // Walk partVerifications for MPN + rendered price.
  const partVerifications: any[] = Array.isArray(state?.partVerifications)
    ? state.partVerifications
    : []

  for (const pv of partVerifications) {
    const mpn = String(pv?.part_number ?? '').trim()
    if (!mpn) continue

    // Resolve the rendered unit price: cost-repair result → estimate → raw
    const unitPrice = Number(
      pv?.cost_repair_corrected_price_gbp ??
      pv?.price_estimate_gbp ??
      pv?.unit_price_gbp ??
      0,
    )
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) continue

    const wordId = String(pv?.word_id ?? pv?.id ?? '')
    const qty = quantityByWordId.get(wordId) ?? null

    // Skip zero-quantity (deleted) lines
    if (qty !== null && qty === 0) continue

    out.push({
      word_id: wordId,
      word_name: String(pv?.word_name ?? ''),
      part_number: mpn,
      manufacturer: pv?.manufacturer ? String(pv.manufacturer).trim() : null,
      unit_price_gbp: unitPrice,
      module_id: String(pv?.module ?? ''),
      sub_module_id: String(pv?.sub_module_id ?? ''),
    })
  }

  return out
}

// ── SEVERITY ─────────────────────────────────────────────────────────────────

export type PricePlausibilitySeverity = 'HIGH' | 'MEDIUM' | 'LOW' | 'PASS'

function classifySeverity(ratio: number): PricePlausibilitySeverity {
  // Ratio = bom_unit_price / distributor_best
  // > 5 or < 0.2: massive error in either direction → HIGH
  if (ratio > 5 || ratio < 0.2) return 'HIGH'
  // [3, 5] or [0.2, 0.33]: outside 3× band → MEDIUM
  if (ratio > 3 || ratio < 0.33) return 'MEDIUM'
  // [2, 3] or [0.33, 0.5]: borderline → LOW
  if (ratio > 2 || ratio < 0.5) return 'LOW'
  // [0.5, 2]: acceptable
  return 'PASS'
}

// ── FINDING SHAPE ─────────────────────────────────────────────────────────────

export interface PricePlausibilityFinding {
  id: string
  part_number: string
  manufacturer: string | null
  word_id: string
  word_name: string
  module_id: string
  sub_module_id: string
  bom_unit_price_gbp: number
  distributor_best_gbp: number
  distributor_median_gbp: number
  ratio: number
  severity: PricePlausibilitySeverity
  top_source: string
  all_sources: Array<{ source: string; unitPriceGbp: number }>
  nexar_tried: boolean
  explanation: string
}

export interface PricePlausibilityAuditResult {
  findings: PricePlausibilityFinding[]
  lines_audited: number
  lines_skipped_no_price: number
  lines_skipped_commodity: number
  lines_skipped_too_short: number
  lines_skipped_no_distributor_hit: number
  lines_pass: number
  nexar_calls: number
  per_distributor_hit: Record<string, number>
  product_class: string
}

// ── AUDIT ─────────────────────────────────────────────────────────────────────

export async function auditPerLinePricePlausibility(
  state: any,
): Promise<PricePlausibilityAuditResult> {
  const findings: PricePlausibilityFinding[] = []
  const productClass = String(
    state?.moduleDecomposition?.product_class ??
    state?.parsedBrief?.product_class ??
    '',
  )

  const lines = collectBomPriceLines(state)

  let linesAudited = 0
  let linesSkippedNoPrice = 0
  let linesSkippedCommodity = 0
  let linesSkippedTooShort = 0
  let linesSkippedNoDistributorHit = 0
  let linesPass = 0
  let nexarCalls = 0
  const perDistributorHit: Record<string, number> = {}

  const semaphore = { slots: 3 }
  const seen = new Set<string>()  // dedup by mpn+manufacturer

  const tasks = lines.map((line) => async () => {
    const { part_number, manufacturer, word_id, word_name, module_id, sub_module_id, unit_price_gbp } = line

    // Skip junk MPNs
    if (part_number.length < 2) {
      linesSkippedTooShort += 1
      return
    }

    // Dedup by MPN+manufacturer pair
    const dedupeKey = `${part_number.toLowerCase()}|${(manufacturer ?? '').toLowerCase()}`
    if (seen.has(dedupeKey)) return
    seen.add(dedupeKey)

    // Skip commodity descriptors
    if (COMMODITY_SKIP_REGEX.test(part_number)) {
      linesSkippedCommodity += 1
      return
    }

    // Skip short alphanumeric tokens
    if (SHORT_ALPHANUMERIC_REGEX.test(part_number)) {
      linesSkippedTooShort += 1
      return
    }

    linesAudited += 1

    // Live price lookup (semaphore-gated)
    const lookup = await runWithSemaphore(semaphore, () =>
      priceCascadeLookup(part_number, manufacturer),
    )

    if (lookup.nexar_tried) nexarCalls += 1
    for (const { source } of lookup.pricesGbp) {
      perDistributorHit[source] = (perDistributorHit[source] ?? 0) + 1
    }

    // If no distributor returned a price, skip — gate 20 already handles
    // existence; gate 21 has nothing to compare against.
    if (lookup.pricesGbp.length === 0) {
      linesSkippedNoDistributorHit += 1
      return
    }

    const prices = lookup.pricesGbp.map((x) => x.unitPriceGbp)
    const distributorBest = Math.min(...prices)
    const distributorMedian = median(prices)
    const cheapestSource = lookup.pricesGbp.reduce(
      (best, x) => (x.unitPriceGbp < best.unitPriceGbp ? x : best),
      lookup.pricesGbp[0],
    )

    const ratio = unit_price_gbp / distributorBest
    const severity = classifySeverity(ratio)

    if (severity === 'PASS') {
      linesPass += 1
      return
    }

    const directionNote = ratio > 1
      ? `BoM price is ${ratio.toFixed(1)}× MORE EXPENSIVE than the cheapest distributor source — suggests over-billing, wrong quantity break, or stale catalogue data.`
      : `BoM price is ${(1 / ratio).toFixed(1)}× CHEAPER than the cheapest distributor source — suggests currency confusion (USD quoted as GBP?), incorrect unit basis (per-lot vs per-unit?), or stale pre-negotiated quote.`

    findings.push({
      id: `${word_id}:${part_number}`,
      part_number,
      manufacturer,
      word_id,
      word_name,
      module_id,
      sub_module_id,
      bom_unit_price_gbp: unit_price_gbp,
      distributor_best_gbp: distributorBest,
      distributor_median_gbp: distributorMedian,
      ratio,
      severity,
      top_source: `${cheapestSource.source} £${cheapestSource.unitPriceGbp.toFixed(2)}`,
      all_sources: lookup.pricesGbp,
      nexar_tried: lookup.nexar_tried,
      explanation:
        `Gate 21 per-line plausibility: BoM renders "${word_name}" (MPN: ${part_number}` +
        `${manufacturer ? `, manufacturer: ${manufacturer}` : ''}) at £${unit_price_gbp.toFixed(2)} per unit. ` +
        `Cheapest live distributor price (${cheapestSource.source}) = £${distributorBest.toFixed(2)}. ` +
        `Ratio = ${ratio.toFixed(2)}. ${directionNote} ` +
        `Gate 10 B-7 (aggregate cost band) would not catch this because per-line errors can cancel across the BoM. ` +
        `Fix: (a) verify the correct unit basis — is this per-unit or per-reel/lot/pack? ` +
        `(b) check currency — if the source price was in USD, divide by ~1.27 to get GBP. ` +
        `(c) check catalogue year — prices may have changed significantly since the training data was collected. ` +
        `(d) use the qty-break price appropriate for the design quantity (${lookup.pricesGbp.map(x => `${x.source}: £${x.unitPriceGbp.toFixed(2)}`).join(', ')}).`,
    })
  })

  // Launch all tasks concurrently. Each task acquires the semaphore internally
  // before calling priceCascadeLookup, so at most 3 distributor fan-outs are
  // in flight simultaneously.
  await Promise.all(tasks.map((t) => t()))

  return {
    findings,
    lines_audited: linesAudited,
    lines_skipped_no_price: linesSkippedNoPrice,
    lines_skipped_commodity: linesSkippedCommodity,
    lines_skipped_too_short: linesSkippedTooShort,
    lines_skipped_no_distributor_hit: linesSkippedNoDistributorHit,
    lines_pass: linesPass,
    nexar_calls: nexarCalls,
    per_distributor_hit: perDistributorHit,
    product_class: productClass,
  }
}

// ── MARKDOWN RENDERER ─────────────────────────────────────────────────────────

function renderMarkdown(result: PricePlausibilityAuditResult, statePath: string): string {
  const lines: string[] = []
  lines.push(`# Per-Line BoM Price Plausibility Audit (gate 21) — ${statePath}`)
  lines.push('')
  lines.push(`**Product class:** \`${result.product_class}\``)
  lines.push('')

  const high = result.findings.filter((f) => f.severity === 'HIGH')
  const med = result.findings.filter((f) => f.severity === 'MEDIUM')
  const low = result.findings.filter((f) => f.severity === 'LOW')

  lines.push('## Summary')
  lines.push('')
  lines.push(
    `**${result.lines_audited} BoM line(s) audited** against live distributor cascade. ` +
    `${result.lines_pass} PASS, ${high.length} HIGH, ${med.length} MEDIUM, ${low.length} LOW.`,
  )
  lines.push('')
  lines.push(
    `**Skipped:** ${result.lines_skipped_commodity} commodity descriptors, ` +
    `${result.lines_skipped_too_short} short/ambiguous MPNs, ` +
    `${result.lines_skipped_no_distributor_hit} lines with no distributor hit ` +
    `(gate 20 may have already flagged those), ` +
    `${result.lines_skipped_no_price} lines with no rendered price.`,
  )
  lines.push('')
  lines.push(
    `**Nexar calls used:** ${result.nexar_calls} ` +
    `(Nexar only called as last resort when all 4 native distributors miss — ` +
    `conserves 100/month Evaluation-plan quota).`,
  )
  lines.push('')

  if (Object.keys(result.per_distributor_hit).length > 0) {
    lines.push('**Per-distributor price hits:**')
    for (const [src, count] of Object.entries(result.per_distributor_hit).sort()) {
      lines.push(`  - ${src}: ${count}`)
    }
    lines.push('')
  }

  if (result.findings.length === 0) {
    lines.push(
      'PASS — every audited BoM line with a live distributor match has a unit price ' +
      'within [0.5×, 2.0×] of the cheapest distributor source.',
    )
    return lines.join('\n')
  }

  lines.push(
    `FAIL — ${result.findings.length} finding(s): ` +
    `${high.length} HIGH (chain-blocking), ${med.length} MEDIUM, ${low.length} LOW.`,
  )
  lines.push('')

  const sorted = [...result.findings].sort((a, b) => {
    const order: Record<PricePlausibilitySeverity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2, PASS: 3 }
    return order[a.severity] - order[b.severity]
  })

  if (high.length > 0) {
    lines.push('## HIGH findings (chain-blocking)')
    lines.push('')
    for (const f of sorted.filter((x) => x.severity === 'HIGH')) {
      const mfrDisplay = f.manufacturer ? ` (${f.manufacturer})` : ''
      lines.push(`### [HIGH] ${f.part_number}${mfrDisplay}`)
      lines.push(`- **Word:** \`${f.word_id}\` — "${f.word_name}"`)
      lines.push(`- **Module:** \`${f.module_id}\` → \`${f.sub_module_id}\``)
      lines.push(`- **BoM unit price (rendered):** £${f.bom_unit_price_gbp.toFixed(2)}`)
      lines.push(`- **Cheapest distributor:** ${f.top_source}`)
      lines.push(`- **Distributor median:** £${f.distributor_median_gbp.toFixed(2)}`)
      lines.push(`- **Ratio:** ${f.ratio.toFixed(2)}× (threshold: outside [0.2, 5])`)
      lines.push(`- **All sources:** ${f.all_sources.map(x => `${x.source} £${x.unitPriceGbp.toFixed(2)}`).join(', ')}`)
      lines.push(`- **Nexar tried:** ${f.nexar_tried ? 'yes' : 'no (native distributor hit)'}`)
      lines.push(`- **Fix:** ${f.explanation}`)
      lines.push('')
    }
  }

  if (med.length > 0) {
    lines.push('## MEDIUM findings (informational)')
    lines.push('')
    for (const f of sorted.filter((x) => x.severity === 'MEDIUM')) {
      const mfrDisplay = f.manufacturer ? ` (${f.manufacturer})` : ''
      lines.push(`### [MEDIUM] ${f.part_number}${mfrDisplay}`)
      lines.push(`- **Word:** \`${f.word_id}\` — "${f.word_name}"`)
      lines.push(`- **Module:** \`${f.module_id}\` → \`${f.sub_module_id}\``)
      lines.push(`- **BoM unit price (rendered):** £${f.bom_unit_price_gbp.toFixed(2)}`)
      lines.push(`- **Cheapest distributor:** ${f.top_source}`)
      lines.push(`- **Distributor median:** £${f.distributor_median_gbp.toFixed(2)}`)
      lines.push(`- **Ratio:** ${f.ratio.toFixed(2)}× (threshold: outside [0.33, 3])`)
      lines.push(`- **Fix:** ${f.explanation}`)
      lines.push('')
    }
  }

  if (low.length > 0) {
    lines.push('## LOW findings (informational)')
    lines.push('')
    for (const f of sorted.filter((x) => x.severity === 'LOW')) {
      const mfrDisplay = f.manufacturer ? ` (${f.manufacturer})` : ''
      lines.push(`### [LOW] ${f.part_number}${mfrDisplay}`)
      lines.push(`- **Word:** \`${f.word_id}\` — "${f.word_name}"`)
      lines.push(`- **Module:** \`${f.module_id}\` → \`${f.sub_module_id}\``)
      lines.push(`- **BoM unit price (rendered):** £${f.bom_unit_price_gbp.toFixed(2)}`)
      lines.push(`- **Cheapest distributor:** ${f.top_source}`)
      lines.push(`- **Distributor median:** £${f.distributor_median_gbp.toFixed(2)}`)
      lines.push(`- **Ratio:** ${f.ratio.toFixed(2)}× (threshold: outside [0.5, 2])`)
      lines.push(`- **Fix:** ${f.explanation}`)
      lines.push('')
    }
  }

  lines.push('## Per-distributor stats')
  lines.push('')
  if (Object.keys(result.per_distributor_hit).length === 0) {
    lines.push('No distributor price hits recorded.')
  } else {
    for (const [src, count] of Object.entries(result.per_distributor_hit).sort()) {
      lines.push(`- **${src}:** ${count} price(s) returned`)
    }
  }

  return lines.join('\n')
}

// ── CLI ENTRYPOINT ────────────────────────────────────────────────────────────
// Usage: npx tsx scripts/lib/per-line-price-plausibility-audit.ts <statePath> [outMdPath]
// Exit code 21 on any HIGH-severity finding (chain fails fast).
// Exit code 0 on PASS (no HIGH findings; MEDs/LOWs are informational only).
// Exit code 1 on IO or runtime error.

const argv1 = process.argv[1] ?? ''
const isMain = /per-line-price-plausibility-audit\.(?:ts|js|mjs|cjs)$/.test(argv1)

if (isMain) {
  const statePath = process.argv[2]
  const outMdPath = process.argv[3]
  if (!statePath) {
    console.error('Usage: per-line-price-plausibility-audit <statePath> [outMdPath]')
    process.exit(1)
  }
  let state: any
  try {
    state = JSON.parse(readFileSync(statePath, 'utf-8'))
  } catch (err) {
    console.error(
      `[per-line-price-audit] failed to read ${statePath}: ${(err as Error).message}`,
    )
    process.exit(1)
  }

  auditPerLinePricePlausibility(state).then((result) => {
    const md = renderMarkdown(result, statePath)
    if (outMdPath) {
      writeFileSync(outMdPath, md, 'utf-8')
      console.log(`[per-line-price-audit] wrote ${outMdPath}`)
    } else {
      console.log(md)
    }
    const high = result.findings.filter((f) => f.severity === 'HIGH')
    if (high.length > 0) {
      console.error(
        `[per-line-price-audit] FAIL: ${high.length} HIGH-severity finding(s) — ` +
        `BoM unit prices diverge > 5× from live distributor prices`,
      )
      process.exit(21)
    }
    console.log(
      `[per-line-price-audit] PASS: ${result.lines_audited} lines audited, ` +
      `${result.lines_pass} PASS, ` +
      `${result.findings.filter((f) => f.severity === 'MEDIUM').length} MEDIUM, ` +
      `${result.findings.filter((f) => f.severity === 'LOW').length} LOW (non-blocking). ` +
      `Nexar calls used: ${result.nexar_calls}.`,
    )
  }).catch((err) => {
    console.error(`[per-line-price-audit] runtime error: ${(err as Error).message}`)
    process.exit(1)
  })
}
