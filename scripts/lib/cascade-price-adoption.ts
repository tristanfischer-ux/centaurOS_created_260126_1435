/**
 * cascade-price-adoption.ts — distributor-catalogue price adoption (gate-21 alignment).
 *
 * THE RULE (Tristan 2026-07-03, codema v58 exit-21 block): when a BoM line carries a REAL
 * pinned MPN whose price exists in the DB-cached distributor cascade — the SAME source gate 21
 * reads (`lookupCached`, DB-only, zero quota) — the line's unit price ADOPTS the cascade price
 * (qty-break-aware, GBP as the cache stores it) and the basis states
 * `distributor catalogue (db:mouser £45.68)`. The parametric estimate survives only as a note.
 *
 * WHY (the v58 defect): fill-blank-mpn pinned the real Amphenol NPC-1220-030D-3-L onto the
 * differential-pressure switch, but the line kept its £420 parametric-physics ESTIMATE while
 * distributor_cascade_cache held Mouser £45.68 for that exact MPN — gate 21 correctly blocked
 * at 9.19×. The £420 survived because the price-read paths diverge: the physics bottom-up pass
 * stamps the word's parametric `price_estimate_gbp` modifier onto BOTH
 * `cost_repair_corrected_price_gbp` and `price_estimate_gbp` (the two fields gate 21 reads),
 * while the cost-grounding pass wrote the cache price only to `distributor_price_gbp` /
 * `cost_grounding_*` — fields gate 21 never reads. This module closes the loop: ONE adoption
 * pass, run AFTER every price-finalisation pass (physics bottom-up, R1 anchor re-price,
 * bom-cost-grounding) and BEFORE the state persists for gate 21 — so the engine's own DB is
 * always preferred over its own estimate wherever the DB actually has the answer
 * (the growing-DB principle's missing link).
 *
 * GUARANTEES (each proven by `--selftest` + the gate-registry proveCatch):
 *   1. A REAL pinned MPN with a cached cascade price ADOPTS that price (all three read fields:
 *      distributor_price_gbp + price_estimate_gbp + cost_repair_corrected_price_gbp when set).
 *   2. A TBD / placeholder / fictional-descriptor MPN NEVER adopts.
 *   3. An EXPLICIT distributor-sourced price already present is NEVER overridden
 *      (emitter list_price_gbp pin, corpus_price, material take-off, Engine-B db_cache,
 *      a prior adoption, or a verified distributor price that IS the rendered price).
 *   4. Sanity band: adopt only when the cascade price is plausible (> £0.50).
 *   5. Qty-break aware: the break with the largest qty ≤ the line quantity wins (else qty-1).
 *   6. A line rolled into a parent assembly (parametric-physics roll-up) keeps its roll-up
 *      exclusion, and the PARENT's rolled price is re-based by the delta — totals stay honest.
 *   7. Idempotent — a second run adopts nothing.
 *   8. The word's own `price_estimate_gbp` modifier is re-based too (requirements_bom.py's
 *      `_child_price` reads it for the assembly breakdown) and a `price_basis` modifier
 *      carries the catalogue basis — so the DELIVERED Excel shows the same number + basis.
 *
 * CHAIN-AS-DB-CONSUMER: reads ONLY forge-truth.db via db-only-cascade.ts::lookupCached.
 * No live distributor API calls. Zero quota consumed.
 *
 * CLI:
 *   npx tsx scripts/lib/cascade-price-adoption.ts <statePath> [--write] [--json]
 *   npx tsx scripts/lib/cascade-price-adoption.ts --selftest
 *
 * `--json` prints a PURE-JSON summary on stdout (all logs on stderr).
 *
 * Pre-change mempalace search: distributor cascade cache price adoption fill-blank-mpn
 * gate 21 parametric estimate MPN pinned → 6 drawers loaded.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { lookupCached } from '../../src/lib/pdf-engine-v2/lib/distributors/db-only-cascade'
import {
  COMMODITY_SKIP_REGEX,
  SHORT_ALPHANUMERIC_REGEX,
  reconcileUnitBasis,
} from './per-line-price-plausibility-audit'

// ── Types (structural — no dependency on the live-adapter DistributorResult) ──

export interface CascadePriceBreak { qty: number; unitPriceGbp: number }

export interface CascadeLookupResult {
  found: boolean
  source: string // 'cache_hit' | 'cache_miss_confirmed' | 'library_only' | 'unknown'
  result: { source?: string; priceGBP?: CascadePriceBreak[] } | null
}

export type CascadeLookupFn = (manufacturer: string | null, mpn: string) => CascadeLookupResult

export interface PriceAdoption {
  word_id: string
  part_number: string
  manufacturer: string | null
  quantity: number
  previous_price_gbp: number | null
  previous_provenance: string | null
  adopted_price_gbp: number
  qty_break: number
  db_source: string
  basis: string
}

export interface ParentRebase {
  word_id: string
  previous_unit_gbp: number
  rebased_unit_gbp: number
  child_word_id: string
}

export interface AdoptionSummary {
  adoptions: PriceAdoption[]
  parent_rebases: ParentRebase[]
  scanned: number
  skipped_placeholder_mpn: number
  skipped_commodity_or_short: number
  skipped_explicit_distributor: number
  skipped_no_cache_price: number
  skipped_implausible: number
  skipped_zero_qty: number
  /** Piece-of-stock lines (pad/gasket/label/per-metre) whose per-piece price
   *  reconciles to the cascade STOCK-unit price via an integer die-cut yield —
   *  adopting the per-sheet/per-reel price onto the per-piece line would
   *  over-bill by the yield factor (gate-21 unit-basis rule, 2026-07-03). */
  skipped_unit_basis_mismatch: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const DISTRIBUTOR_CATALOGUE_PROVENANCE = 'distributor-catalogue'

/** Sanity band: never adopt a cascade price at or below this (a £0.02 stock-only
 *  stub or a data-entry artefact is not a plausible unit price for an engineered part). */
export const ADOPTION_MIN_PLAUSIBLE_GBP = 0.5

/** Placeholder / deferred / fictional-descriptor MPNs — NEVER adopt onto these.
 *  Superset of emitter-completion's isBlankOrPlaceholderMpn vocabulary plus the
 *  honest-descriptor "Specify at detailed design" form fill-blank-mpn emits on
 *  generate-on-miss. */
export const PLACEHOLDER_MPN_REGEX =
  /\b(specify|tbd|tba|to\s+be\s+(confirmed|selected|determined|advised)|detailed\s+design|n\/?a|placeholder|unknown|custom|generic|bespoke|various)\b/i

/** Price-source tags that mean "this price is ALREADY an explicit catalogue /
 *  distributor / take-off figure" — adoption must never override them. */
const EXPLICIT_PRICE_SOURCES = new Set([
  'emitter_list_price',
  'corpus_price',
  'material_takeoff',
  'db_cache',
  'distributor_catalogue_cache',
])

const round2 = (n: number): number => Math.round(n * 100) / 100

// ── Pure helpers ──────────────────────────────────────────────────────────────

/** Pick the qty-break whose qty is the largest ≤ the line quantity; fall back to
 *  the lowest-qty positive break (the qty-1 price gate 21 benchmarks against). */
export function chooseQtyBreak(
  breaks: CascadePriceBreak[] | undefined,
  quantity: number,
): CascadePriceBreak | null {
  const valid = (breaks ?? [])
    .filter((b) => Number.isFinite(b?.qty) && Number.isFinite(b?.unitPriceGbp) && b.unitPriceGbp > 0)
    .sort((a, b) => a.qty - b.qty)
  if (valid.length === 0) return null
  let chosen = valid[0]
  for (const b of valid) {
    if (b.qty <= Math.max(1, quantity)) chosen = b
  }
  return chosen
}

/** The rendered unit price gate 21 reads (same cascade, same fields). */
function effectiveRenderedPrice(pv: any): number | null {
  const p = Number(pv?.cost_repair_corrected_price_gbp ?? pv?.price_estimate_gbp ?? pv?.unit_price_gbp ?? 0)
  return Number.isFinite(p) && p > 0 ? p : null
}

/** Is the line's price ALREADY an explicit distributor/catalogue-sourced figure? */
export function hasExplicitDistributorPrice(pv: any): boolean {
  if (String(pv?.cost_provenance ?? '') === DISTRIBUTOR_CATALOGUE_PROVENANCE) return true
  for (const field of ['distributor_price_source', 'price_estimate_source', 'estimate_source', 'engine_b_estimate_source']) {
    if (EXPLICIT_PRICE_SOURCES.has(String(pv?.[field] ?? ''))) return true
  }
  // A verified distributor price that IS the rendered price (or the only price on
  // the line — the render bridge serves it) is explicit; a stale side-field shadowed
  // by a parametric estimate (the v58 £29-vs-£420 case) is NOT.
  const dist = Number(pv?.distributor_price_gbp ?? 0)
  if (dist > 0) {
    const eff = effectiveRenderedPrice(pv)
    if (eff === null || Math.abs(eff - dist) < 0.005) return true
  }
  return false
}

// ── State walking ─────────────────────────────────────────────────────────────

interface WordRef { word: any; qty: number }

function indexWords(state: any): Map<string, WordRef> {
  const out = new Map<string, WordRef>()
  for (const m of state?.moduleDecomposition?.modules ?? []) {
    for (const sm of Array.isArray(m?.sub_modules) ? m.sub_modules : []) {
      for (const w of Array.isArray(sm?.words) ? sm.words : []) {
        const wid = String(w?.id ?? '')
        if (!wid) continue
        let qty = 1
        const qmod = (w?.modifier_characters ?? []).find((mc: any) => mc?.kind === 'quantity')
        if (qmod) {
          const n = parseInt(String(qmod.value).replace(/[×x,\s]/g, ''), 10)
          if (Number.isFinite(n) && n >= 0) qty = n
        }
        out.set(wid, { word: w, qty })
      }
    }
  }
  return out
}

function setWordModifier(word: any, kind: string, value: string): void {
  if (!word) return
  const mods: any[] = Array.isArray(word.modifier_characters) ? word.modifier_characters : []
  const existing = mods.find((mc) => mc?.kind === kind)
  if (existing) existing.value = value
  else mods.push({ kind, value })
  word.modifier_characters = mods
}

// ── The adoption pass ─────────────────────────────────────────────────────────

export function adoptCascadePrices(
  state: any,
  opts: { lookup?: CascadeLookupFn } = {},
): AdoptionSummary {
  const lookup: CascadeLookupFn = opts.lookup ?? (lookupCached as unknown as CascadeLookupFn)
  const summary: AdoptionSummary = {
    adoptions: [], parent_rebases: [], scanned: 0,
    skipped_placeholder_mpn: 0, skipped_commodity_or_short: 0,
    skipped_explicit_distributor: 0, skipped_no_cache_price: 0,
    skipped_implausible: 0, skipped_zero_qty: 0,
    skipped_unit_basis_mismatch: 0,
  }
  const pvs: any[] = Array.isArray(state?.partVerifications) ? state.partVerifications : []
  const wordsById = indexWords(state)
  const pvByWordId = new Map<string, any>()
  for (const v of pvs) {
    const wid = String(v?.word_id ?? '')
    if (wid && !pvByWordId.has(wid)) pvByWordId.set(wid, v)
  }

  for (const v of pvs) {
    summary.scanned++
    const mpn = String(v?.part_number ?? '').trim()
    // 1. Real pinned MPN only — a TBD / deferred / descriptor MPN never adopts.
    if (!mpn || PLACEHOLDER_MPN_REGEX.test(mpn)) { summary.skipped_placeholder_mpn++; continue }
    // Mirror gate 21's own skip set (ONE matcher: the audit's exported regexes) —
    // adoption only acts where gate 21 would audit.
    if (COMMODITY_SKIP_REGEX.test(mpn) || SHORT_ALPHANUMERIC_REGEX.test(mpn)) {
      summary.skipped_commodity_or_short++; continue
    }
    // 2. Never override an explicit distributor-sourced price already present.
    if (hasExplicitDistributorPrice(v)) { summary.skipped_explicit_distributor++; continue }

    const wid = String(v?.word_id ?? '')
    const ref = wordsById.get(wid)
    const qty = ref?.qty ?? 1
    if (qty === 0) { summary.skipped_zero_qty++; continue } // deleted line

    // 3. The SAME source gate 21 reads: DB-only cascade, cache_hit rows only.
    const res = lookup(v?.manufacturer ? String(v.manufacturer) : null, mpn)
    if (!res?.found || res.source !== 'cache_hit' || !res.result) { summary.skipped_no_cache_price++; continue }
    const brk = chooseQtyBreak(res.result.priceGBP, qty)
    if (!brk) { summary.skipped_no_cache_price++; continue }
    // 4. Sanity band — a cascade price must be plausible for an engineered part.
    if (!(brk.unitPriceGbp > ADOPTION_MIN_PLAUSIBLE_GBP)) { summary.skipped_implausible++; continue }

    const adopted = round2(brk.unitPriceGbp)
    const previous = effectiveRenderedPrice(v)

    // 5. UNIT-BASIS guard (gate-21 rule, 2026-07-03 Bergquist GP3000S30): the
    // cascade sells the STOCK unit (a Gap Pad SHEET, a cable REEL) while a
    // piece-of-stock BoM line prices ONE piece die-cut / cut-to-length from it.
    // When the current per-piece price reconciles to the cascade stock price via
    // an integer yield in [2, 500], BOTH numbers are right on different bases —
    // adopting the per-sheet price onto the per-piece line would over-bill by
    // the yield factor. Skip; gate 21 reports it as a reconciled MEDIUM note.
    if (previous !== null) {
      const wordName = String(v?.word_name ?? ref?.word?.name_human ?? '')
      if (reconcileUnitBasis(wordName, previous, adopted).applied) {
        summary.skipped_unit_basis_mismatch++; continue
      }
    }
    if (previous !== null && Math.abs(previous - adopted) < 0.005) continue // already at catalogue truth — untouched (byte-identity)

    const dbSource = String(res.result.source ?? 'cache')
    const basis =
      `distributor catalogue (db:${dbSource} £${adopted.toFixed(2)}` +
      (brk.qty > 1 ? ` @ qty≥${brk.qty}` : '') + ')'
    const previousProvenance = v?.cost_provenance
      ? String(v.cost_provenance)
      : (v?.estimate_source ? String(v.estimate_source) : null)

    // ── ADOPT: one authoritative number across EVERY read path ──
    // (gate 21: cost_repair_corrected ?? price_estimate; render/G2/cost-basis:
    //  distributor_price_gbp first; requirements_bom: corrected/estimate/distributor.)
    if (previous !== null) {
      // The estimate survives only as a note.
      v.price_adoption_note =
        `${previousProvenance ?? 'prior'} estimate £${previous.toFixed(2)} superseded by ${basis}`
      v.pre_adoption_price_gbp = previous
    }
    v.distributor_price_gbp = adopted
    v.distributor_price_source = 'distributor_catalogue_cache'
    v.price_estimate_gbp = adopted
    v.price_estimate_source = 'distributor_catalogue_cache'
    v.price_estimate_reasoning = basis
    if (v.cost_repair_corrected_price_gbp != null) v.cost_repair_corrected_price_gbp = adopted
    v.cost_provenance = DISTRIBUTOR_CATALOGUE_PROVENANCE

    // Re-base the word's own parametric modifier + stamp the auditable basis so the
    // DELIVERED breakdown (requirements_bom.py `_child_price` / `price_basis`) agrees.
    if (ref?.word) {
      const hasParametricMod = (ref.word.modifier_characters ?? [])
        .some((mc: any) => mc?.kind === 'price_estimate_gbp')
      if (hasParametricMod) setWordModifier(ref.word, 'price_estimate_gbp', String(adopted))
      setWordModifier(ref.word, 'price_basis',
        previous !== null ? `${basis} — supersedes parametric estimate £${previous.toFixed(2)}` : basis)
    }

    // ── Parent roll-up re-base: a sub-component rolled into its parent assembly
    // (physics bottom-up pass) keeps its exclusion, and the parent's rolled unit
    // price moves by the delta — totals stay honest, no double count. ──
    if (v.cost_repair_excluded_from_subtotal === true && previous !== null && wid.includes('__')) {
      const parentId = wid.slice(0, wid.indexOf('__'))
      const parent = pvByWordId.get(parentId)
      if (parent && String(parent.cost_provenance ?? '') === 'parametric-physics-rollup') {
        const parentQty = wordsById.get(parentId)?.qty ?? 1
        const deltaUnit = ((previous - adopted) * qty) / Math.max(1, parentQty)
        const prevParentUnit = Number(parent.price_estimate_gbp ?? 0)
        const rebased = round2(Math.max(0, prevParentUnit - deltaUnit))
        parent.price_estimate_gbp = rebased
        if (parent.cost_repair_corrected_price_gbp != null) parent.cost_repair_corrected_price_gbp = rebased
        parent.price_adoption_note =
          `${parent.price_adoption_note ? `${parent.price_adoption_note}; ` : ''}` +
          `roll-up re-based £${prevParentUnit.toFixed(2)} → £${rebased.toFixed(2)}: ` +
          `sub-component ${wid} adopted ${basis}`
        summary.parent_rebases.push({
          word_id: parentId, previous_unit_gbp: prevParentUnit,
          rebased_unit_gbp: rebased, child_word_id: wid,
        })
      } else {
        // Not a roll-up exclusion (e.g. a cost-repair UP-cap "manual sourcing"
        // placeholder) — a real catalogue price makes the line billable again.
        v.cost_repair_excluded_from_subtotal = false
      }
    }

    summary.adoptions.push({
      word_id: wid, part_number: mpn,
      manufacturer: v?.manufacturer ? String(v.manufacturer) : null,
      quantity: qty, previous_price_gbp: previous,
      previous_provenance: previousProvenance,
      adopted_price_gbp: adopted, qty_break: brk.qty,
      db_source: dbSource, basis,
    })
  }

  return summary
}

// ── Self-test (proveCatch substrate — pure, injected lookup, no DB) ───────────

export function selftestCascadePriceAdoption(): { ok: boolean; failures: string[] } {
  const failures: string[] = []
  const check = (cond: boolean, label: string) => { if (!cond) failures.push(label) }

  // Keyed like the real cache: a hit ONLY for the named MPN (default: any MPN).
  const cacheHit = (breaks: CascadePriceBreak[], onlyMpn?: string): CascadeLookupFn => (_mfr, mpn) =>
    (onlyMpn === undefined || mpn === onlyMpn)
      ? { found: true, source: 'cache_hit', result: { source: 'mouser', priceGBP: breaks } }
      : { found: false, source: 'unknown', result: null }
  const V58_BREAKS: CascadePriceBreak[] = [
    { qty: 1, unitPriceGbp: 45.68 }, { qty: 5, unitPriceGbp: 38.53 },
    { qty: 10, unitPriceGbp: 35.8 }, { qty: 111, unitPriceGbp: 28.82 },
  ]
  const mkState = (pv: any[], words: any[] = []) => {
    return {
      partVerifications: pv,
      moduleDecomposition: { modules: [{ module: 'm', sub_modules: [{ id: 's', words }] }] },
    }
  }

  // 1. REAL pinned MPN + cached price + parametric estimate → ADOPTS (the v58 case).
  {
    const word = {
      id: 'parent__dp_switch',
      modifier_characters: [
        { kind: 'quantity', value: '×2' },
        { kind: 'price_estimate_gbp', value: '420' },
        { kind: 'part_number', value: 'NPC-1220-030D-3-L' },
      ],
    }
    const parentWord = { id: 'parent', modifier_characters: [{ kind: 'quantity', value: '×1' }] }
    const child: any = {
      word_id: 'parent__dp_switch', part_number: 'NPC-1220-030D-3-L',
      manufacturer: 'Amphenol Advanced Sensors',
      price_estimate_gbp: 420, cost_repair_corrected_price_gbp: 420,
      distributor_price_gbp: 29, // stale verify side-field shadowed by the parametric estimate
      cost_provenance: 'parametric-physics', cost_repair_excluded_from_subtotal: true,
    }
    const parent: any = {
      word_id: 'parent', part_number: 'ASSY-100', price_estimate_gbp: 1000,
      cost_repair_corrected_price_gbp: 1000, cost_provenance: 'parametric-physics-rollup',
    }
    const state = mkState([child, parent], [word, parentWord])
    const s = adoptCascadePrices(state, { lookup: cacheHit(V58_BREAKS, 'NPC-1220-030D-3-L') })
    check(s.adoptions.length === 1, 'case1: adopts exactly the real-MPN line')
    check(child.price_estimate_gbp === 45.68 && child.cost_repair_corrected_price_gbp === 45.68
      && child.distributor_price_gbp === 45.68, 'case1: all three read fields re-based to £45.68')
    check(child.cost_provenance === DISTRIBUTOR_CATALOGUE_PROVENANCE, 'case1: provenance = distributor-catalogue')
    check(String(child.price_adoption_note ?? '').includes('420.00')
      && String(child.price_adoption_note ?? '').includes('db:mouser £45.68'),
      'case1: the estimate survives only as a note; basis names the db source')
    check((word.modifier_characters.find((m: any) => m.kind === 'price_estimate_gbp') as any)?.value === '45.68',
      'case1: word parametric modifier re-based')
    check(String((word.modifier_characters.find((m: any) => m.kind === 'price_basis') as any)?.value ?? '')
      .startsWith('distributor catalogue (db:mouser £45.68'), 'case1: price_basis modifier stamped')
    check(child.cost_repair_excluded_from_subtotal === true, 'case1: roll-up exclusion preserved')
    check(s.parent_rebases.length === 1 && parent.price_estimate_gbp === round2(1000 - (420 - 45.68) * 2),
      'case1: parent roll-up re-based by the delta (£1000 → £251.36)')
    // 7. Idempotency: a second run adopts nothing further.
    const s2 = adoptCascadePrices(state, { lookup: cacheHit(V58_BREAKS, 'NPC-1220-030D-3-L') })
    check(s2.adoptions.length === 0 && s2.skipped_explicit_distributor >= 1, 'case1: idempotent (second run adopts nothing)')
  }

  // 2. TBD / placeholder MPN NEVER adopts — even with a cached price.
  {
    for (const bad of ['TBD', 'Specify at detailed design', 'custom', 'generic', 'N/A', '']) {
      const pv: any = { word_id: 'w', part_number: bad, price_estimate_gbp: 420 }
      const s = adoptCascadePrices(mkState([pv]), { lookup: cacheHit(V58_BREAKS) })
      check(s.adoptions.length === 0 && pv.price_estimate_gbp === 420, `case2: "${bad || '<blank>'}" never adopts`)
    }
  }

  // 3. Explicit distributor-sourced price NEVER overridden.
  {
    const pinned: any = { // emitter list_price_gbp pin
      word_id: 'w1', part_number: 'W2E200-HK38-01', price_estimate_gbp: 133.78,
      distributor_price_gbp: 133.78, price_estimate_source: 'emitter_list_price',
    }
    const distOnly: any = { // verified distributor price IS the rendered price (bridge)
      word_id: 'w2', part_number: 'HASS-100-S', distributor_price_gbp: 112.92, source_method: 'mouser',
    }
    const corpus: any = {
      word_id: 'w3', part_number: 'CRNE-5-5', price_estimate_gbp: 3850,
      engine_b_estimate_source: 'corpus_price',
    }
    const s = adoptCascadePrices(mkState([pinned, distOnly, corpus]), { lookup: cacheHit(V58_BREAKS) })
    check(s.adoptions.length === 0 && s.skipped_explicit_distributor === 3
      && pinned.price_estimate_gbp === 133.78 && distOnly.distributor_price_gbp === 112.92
      && corpus.price_estimate_gbp === 3850, 'case3: explicit distributor-sourced prices never overridden')
  }

  // 4. Sanity band: an implausible cascade price (≤ £0.50) never adopts.
  {
    const pv: any = { word_id: 'w', part_number: 'REAL-1234-X', price_estimate_gbp: 420 }
    const s = adoptCascadePrices(mkState([pv]), { lookup: cacheHit([{ qty: 1, unitPriceGbp: 0.3 }]) })
    check(s.adoptions.length === 0 && s.skipped_implausible === 1 && pv.price_estimate_gbp === 420,
      'case4: ≤£0.50 cascade price never adopts')
  }

  // 5. Qty-break selection: qty 111 line takes the 111-break, qty 2 takes qty-1.
  {
    const w111 = { id: 'w111', modifier_characters: [{ kind: 'quantity', value: '×111' }] }
    const pv: any = { word_id: 'w111', part_number: 'REAL-1234-X', price_estimate_gbp: 420 }
    const s = adoptCascadePrices(mkState([pv], [w111]), { lookup: cacheHit(V58_BREAKS) })
    check(s.adoptions.length === 1 && pv.price_estimate_gbp === 28.82 && s.adoptions[0].qty_break === 111,
      'case5: qty-break appropriate to the design quantity wins')
  }

  // 6. cache_miss / library_only / unknown never adopt.
  {
    for (const src of ['cache_miss_confirmed', 'library_only', 'unknown']) {
      const pv: any = { word_id: 'w', part_number: 'REAL-1234-X', price_estimate_gbp: 420 }
      const lk: CascadeLookupFn = () => ({
        found: src === 'library_only', source: src,
        result: src === 'library_only' ? { source: 'mouser', priceGBP: [] } : null,
      })
      const s = adoptCascadePrices(mkState([pv]), { lookup: lk })
      check(s.adoptions.length === 0 && pv.price_estimate_gbp === 420, `case6: ${src} never adopts`)
    }
  }

  // 8. UNIT-BASIS guard (the Bergquist GP3000S30 shape): a piece-of-stock line
  // whose per-piece price reconciles to the cascade STOCK-unit price never
  // adopts (adopting per-sheet onto per-piece would over-bill ~23×); a
  // NON-stock line with the same ratio still adopts.
  {
    const pad: any = {
      word_id: 'w_pad', part_number: 'GP3000S30', manufacturer: 'Bergquist',
      word_name: 'cell insulation pad', price_estimate_gbp: 2.5,
      cost_provenance: 'parametric-physics',
    }
    const sheetPrice: CascadePriceBreak[] = [{ qty: 1, unitPriceGbp: 56.48 }]
    const s = adoptCascadePrices(mkState([pad]), { lookup: cacheHit(sheetPrice, 'GP3000S30') })
    check(s.adoptions.length === 0 && s.skipped_unit_basis_mismatch === 1
      && pad.price_estimate_gbp === 2.5,
      'case8: piece-of-stock per-piece price never adopts the per-sheet cascade price')
    const nonStock: any = {
      word_id: 'w_ns', part_number: 'REAL-1234-X',
      word_name: 'auxiliary relay', price_estimate_gbp: 2.5,
      cost_provenance: 'parametric-physics',
    }
    const s2 = adoptCascadePrices(mkState([nonStock]), { lookup: cacheHit(sheetPrice) })
    check(s2.adoptions.length === 1 && nonStock.price_estimate_gbp === 56.48,
      'case8: non-stock noun with the same ratio still adopts')
  }

  return { ok: failures.length === 0, failures }
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const argv1 = process.argv[1] ?? ''
const isMain = /cascade-price-adoption\.(?:ts|js|mjs|cjs)$/.test(argv1)

if (isMain) {
  const args = process.argv.slice(2)
  if (args.includes('--selftest')) {
    const { ok, failures } = selftestCascadePriceAdoption()
    if (!ok) {
      console.error(`[cascade-price-adoption] SELFTEST FAIL:\n  - ${failures.join('\n  - ')}`)
      process.exit(1)
    }
    console.log('[cascade-price-adoption] selftest PASS (adopts real-MPN cached price; TBD never adopts; explicit distributor price never overridden; sanity band; qty-break; parent re-base; idempotent; piece-of-stock unit-basis mismatch never adopts)')
    process.exit(0)
  }
  const statePath = args.find((a) => !a.startsWith('--'))
  const write = args.includes('--write')
  const asJson = args.includes('--json')
  if (!statePath) {
    console.error('Usage: cascade-price-adoption <statePath> [--write] [--json] | --selftest')
    process.exit(1)
  }
  const state = JSON.parse(readFileSync(statePath, 'utf-8'))
  const summary = adoptCascadePrices(state)
  if (write && (summary.adoptions.length > 0 || summary.parent_rebases.length > 0)) {
    writeFileSync(statePath, JSON.stringify(state, null, 2))
    console.error(`[cascade-price-adoption] wrote ${statePath}`)
  }
  if (asJson) {
    console.log(JSON.stringify(summary, null, 2))
  } else {
    console.log(`[cascade-price-adoption] ${summary.adoptions.length} adoption(s), ${summary.parent_rebases.length} parent re-base(s) — scanned ${summary.scanned} line(s); skipped: ${summary.skipped_placeholder_mpn} placeholder-MPN, ${summary.skipped_commodity_or_short} commodity/short, ${summary.skipped_explicit_distributor} explicit-distributor, ${summary.skipped_no_cache_price} no-cache-price, ${summary.skipped_implausible} implausible, ${summary.skipped_zero_qty} zero-qty, ${summary.skipped_unit_basis_mismatch} unit-basis-mismatch`)
    for (const a of summary.adoptions) {
      console.log(`  ↳ ${a.word_id} (${a.manufacturer ?? '?'} ${a.part_number}) ×${a.quantity}: £${a.previous_price_gbp?.toFixed(2) ?? '—'} → £${a.adopted_price_gbp.toFixed(2)} — ${a.basis}`)
    }
    for (const p of summary.parent_rebases) {
      console.log(`  ⤷ parent ${p.word_id}: £${p.previous_unit_gbp.toFixed(2)} → £${p.rebased_unit_gbp.toFixed(2)} (roll-up re-based for ${p.child_word_id})`)
    }
  }
}
