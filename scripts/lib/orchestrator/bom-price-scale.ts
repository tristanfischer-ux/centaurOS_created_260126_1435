/**
 * bom-price-scale.ts — UNIVERSAL Layer-3 cost-scale pass for class emitters.
 *
 * THE PROBLEM (Tristan's 2x SAF scale-up, 2026-06-12, drawer
 * forgeos_gotchas_bc02fad34b716b71): process-plant emitters pin a FLAT
 * `list_price_gbp` on every BoM word, authored for the class's design-point
 * throughput. The capacity/rating/mass SPECS scale with the brief, but the PRICES
 * don't — so the dossier cost is blind to production rate (a 2x plant costed 1.04x).
 *
 * THE FIX: scale each line's price by its OWN size-spec ratio vs the design point
 * (six-tenths: price ∝ spec^0.65) — bottom-up. A line whose per-line spec is itself
 * a frozen literal (a fixed-dimension vessel) falls back to the CLASS-OUTPUT ratio
 * (process equipment scales with the plant), EXCEPT genuinely fixed-cost control +
 * safety electronics (a bigger plant needs the same DCS/SIS, not 1.5x of it).
 *
 * Usage from a class emitter:
 *   const pRef = deriveParams({ quantities: {} })          // the design point
 *   const refModules = [ ...emit each module with pRef ]   // 1x reference specs
 *   scaleBomPricesByThroughput(modules, refModules, pNow.headline / pRef.headline)
 *
 * The caller builds refModules with its own emitters + design-point params, and
 * passes its own class-output ratio (the brief's headline metric vs the design
 * point). This util is pure structure-walking — class-agnostic.
 */

// Genuinely ~fixed-cost equipment (control + safety electronics) — never gets the
// class-output fallback. Matched against the word id.
export const DEFAULT_FIXED_COST_LINE = /dcs|safety_instrumented|sil_barrier|fire_gas|flame_detector|esd_valve|control_cabinet|\bplc\b|\bscada\b|\bhmi\b/i

const SPEC_KINDS = ['capacity', 'rating', 'mass']

/** The word's primary size driver: capacity, then rating, then mass (numeric). 0 if none. */
export function primarySpecValue(w: any): number {
  for (const k of SPEC_KINDS) {
    const m = (w?.modifier_characters ?? []).find((x: any) => x?.kind === k)
    if (m) {
      const n = parseFloat(String(m.value).replace(/[^0-9.eE+-]/g, ''))
      if (Number.isFinite(n) && n > 0) return n
    }
  }
  return 0
}

/**
 * Scale every list_price_gbp pin in `modules` to the brief's production rate.
 * @param modules     the design's modules (mutated in place)
 * @param refModules  the SAME modules emitted at the class design point (1x specs)
 * @param classRatio  brief headline metric / design-point headline (e.g. 2.0 for 2x)
 * @param fixedCost   word-id regex of fixed-cost lines excluded from the fallback
 * @param exp         the six-tenths exponent (default 0.65)
 * @returns the number of lines re-priced (for logging / tests)
 */
export function scaleBomPricesByThroughput(
  modules: any[],
  refModules: any[],
  classRatio: number,
  fixedCost: RegExp = DEFAULT_FIXED_COST_LINE,
  exp = 0.65,
): number {
  const refSpec = new Map<string, number>()
  for (const m of (refModules ?? [])) for (const sm of (m?.sub_modules ?? [])) for (const w of (sm?.words ?? [])) {
    const s = primarySpecValue(w); if (s > 0) refSpec.set(w.id, s)
  }
  let scaled = 0
  for (const m of (modules ?? [])) for (const sm of (m?.sub_modules ?? [])) for (const w of (sm?.words ?? [])) {
    const pm = (w?.modifier_characters ?? []).find((x: any) => x?.kind === 'list_price_gbp')
    if (!pm) continue
    const base = Number(pm.value)
    if (!Number.isFinite(base) || base <= 0) continue
    const now = primarySpecValue(w); const ref = refSpec.get(w.id)
    let factor = 1
    if (now && ref && ref > 0 && Math.abs(now / ref - 1) >= 0.02) {
      factor = Math.pow(now / ref, exp)                 // bottom-up: this line's own size spec
    } else if (!fixedCost.test(String(w.id)) && Math.abs(classRatio - 1) >= 0.02) {
      factor = Math.pow(classRatio, exp)                // fallback: process equipment ∝ plant output
    }
    if (Math.abs(factor - 1) < 0.02) continue
    pm.value = String(Math.round(base * factor))
    scaled++
  }
  return scaled
}
