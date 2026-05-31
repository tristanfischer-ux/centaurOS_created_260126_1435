/**
 * brief-feasibility-gate.ts — deterministic, UP-FRONT check that the brief's OWN
 * hard constraints are physically achievable, BEFORE the engine designs to them.
 *
 * WHY (2026-05-31, Tristan): a BESS brief asking £180k for 3.5 MWh (= £51/kWh)
 * produced a design that "breached the ceiling by 670%" and still scored 9.28 on
 * the council — because the dossier honestly DOCUMENTED the breach. The root cause
 * is that the brief itself is impossible: £51/kWh is ~4× BELOW the £215/kWh
 * commodity FLOOR (market-bands.ts). The existing LLM feasibility critic
 * (serial-design-chain-v2.tsx:1278) is explicitly told "many briefs set targets
 * 2-5× tighter; do NOT refuse these — they're the work", so it waves through
 * sub-floor ceilings as "aggressive". This DETERMINISTIC gate catches
 * "below the physical floor" using the published MARKET_BANDS, independent of any
 * LLM tolerance, so the dossier + scorer can reframe a breach as "the BRIEF is
 * infeasible" rather than "the design failed". Soft (a verdict, not a halt).
 * Universal across every class that has a MARKET_BANDS entry.
 */
import { MARKET_BANDS, type MarketBand } from './market-bands'

export interface BriefFeasibilityVerdict {
  feasible: boolean
  constraint: 'cost_ceiling' | null
  reason: string
  brief_ceiling_gbp?: number
  brief_quantity?: number
  output_unit?: string
  implied_per_unit_gbp?: number
  floor_per_unit_gbp?: number
  realistic_floor_total_gbp?: number
  x_below_floor?: number
  band_source?: string
}

const FEASIBLE = (reason: string): BriefFeasibilityVerdict => ({ feasible: true, constraint: null, reason })

// Flag ONLY when the brief's implied unit cost is >15% BELOW the commodity floor —
// i.e. genuinely impossible, not merely "aggressive". This preserves the engine's
// "aggressive targets are the design problem" philosophy (a brief 10% under the
// floor still passes) while catching the physically-impossible (£51 vs £215/kWh).
const FLOOR_MARGIN = 0.15

function findBand(productClass: string): MarketBand | null {
  const norm = String(productClass ?? '').trim().toLowerCase().replace(/-/g, '_')
  if (!norm) return null
  for (const band of Object.values(MARKET_BANDS)) {
    const pc = String(band.product_class ?? '').toLowerCase().replace(/-/g, '_')
    if (pc && (pc === norm || norm.startsWith(pc) || pc.startsWith(norm))) return band
  }
  return null
}

/** Convert a brief target {value, unit} into the band's output_unit. Returns
 * null when the unit families don't match (so we never compare apples to oranges). */
function toBandUnit(value: number, fromUnit: string, bandUnit: string): number | null {
  const f = String(fromUnit ?? '').trim().toLowerCase().replace('³', '3').replace('²', '2')
  const b = String(bandUnit ?? '').trim().toLowerCase().replace('²', '2')
  const ENERGY: Record<string, number> = { wh: 1, kwh: 1e3, mwh: 1e6, gwh: 1e9 } // → Wh
  const POWER: Record<string, number> = { w: 1, kw: 1e3, mw: 1e6, gw: 1e9 } // → W
  if (b === 'kwh' && f in ENERGY) return (value * ENERGY[f]) / ENERGY['kwh']
  if (b === 'mwh' && f in ENERGY) return (value * ENERGY[f]) / ENERGY['mwh']
  if (b === 'kw' && f in POWER) return (value * POWER[f]) / POWER['kw']
  const AREA = new Set(['m2', 'sqm', 'square_metres', 'square_meters'])
  if (b === 'm2' && AREA.has(f)) return value
  if (b === f) return value // same unit (L, m, kg, unit, …)
  return null
}

/**
 * Judge whether the brief's cost ceiling is physically achievable for the brief's
 * REQUESTED output (NOT the design's achieved output — we judge the brief's own
 * promise). Always returns a verdict; `feasible:true` when there is no band, no
 * ceiling, or no comparable quantity (we never block on missing data).
 */
export function checkBriefFeasibility(state: any, productClass: string): BriefFeasibilityVerdict {
  const band = findBand(productClass)
  if (!band) return FEASIBLE('no market band for class — cannot judge feasibility')

  const constraints = state?.parsedBrief?.constraints ?? {}
  const ceiling =
    typeof constraints?.unit_cost_ceiling?.value === 'number' ? (constraints.unit_cost_ceiling.value as number) : null
  if (ceiling == null || !(ceiling > 0)) return FEASIBLE('no cost ceiling in brief')

  // Brief's REQUESTED output quantity, converted to the band's output unit.
  let qty: number | null = null
  const tp = constraints?.target_performance
  if (tp && typeof tp.value === 'number' && tp.unit) qty = toBandUnit(tp.value, String(tp.unit), band.output_unit)
  if (qty == null) {
    for (const k of ['usable_energy_mwh', 'nameplate_capacity_mwh', 'usable_energy_kwh', 'capacity_kwh', 'capacity_mwh', 'rated_power_kw', 'continuous_power_kw']) {
      const v = (constraints?.[k]?.value ?? constraints?.[k]) as number | undefined
      if (typeof v === 'number' && v > 0) {
        const u = /mwh/i.test(k) ? 'MWh' : /kwh/i.test(k) ? 'kWh' : 'kW'
        qty = toBandUnit(v, u, band.output_unit)
        if (qty != null) break
      }
    }
  }
  if (qty == null || !(qty > 0)) return FEASIBLE('no comparable brief output quantity in band units')

  const floor = band.tiers.commodity.low_gbp
  if (!(floor > 0)) return FEASIBLE('no commodity floor in band')
  const implied = ceiling / qty

  if (implied < floor * (1 - FLOOR_MARGIN)) {
    const xBelow = floor / implied
    return {
      feasible: false,
      constraint: 'cost_ceiling',
      reason:
        `Brief cost ceiling £${Math.round(ceiling).toLocaleString('en-GB')} for ${qty.toLocaleString('en-GB')} ${band.output_unit} implies ` +
        `£${implied.toFixed(0)}/${band.output_unit}, which is ${xBelow.toFixed(1)}× below the £${floor}/${band.output_unit} commodity floor — ` +
        `physically impossible, not merely aggressive. Realistic floor ≈ £${Math.round(floor * qty).toLocaleString('en-GB')}.`,
      brief_ceiling_gbp: ceiling,
      brief_quantity: qty,
      output_unit: band.output_unit,
      implied_per_unit_gbp: implied,
      floor_per_unit_gbp: floor,
      realistic_floor_total_gbp: floor * qty,
      x_below_floor: xBelow,
      band_source: band.source,
    }
  }
  return FEASIBLE(
    `brief ceiling implies £${implied.toFixed(0)}/${band.output_unit}, at/above the £${floor}/${band.output_unit} commodity floor — feasible (possibly aggressive)`,
  )
}
