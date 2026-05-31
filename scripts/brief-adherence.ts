/**
 * brief-adherence.ts — DETERMINISTIC verdict: does the FINISHED design meet the
 * brief's HARD numeric constraints? Produces a score CAP so an "8+" cannot be
 * claimed on a design that fails the brief.
 *
 * WHY (2026-05-31, Tristan): the multimodal council rubric scores DOCUMENT
 * quality and never penalises a hard-constraint breach — BESS scored 9.28 at
 * 7.7× over the cost ceiling + 23% under the energy target because the dossier
 * documented the breach honestly. The council CANNOT be trusted to notice, so
 * this does NOT ask it to: it reads the structured ACHIEVED values from
 * state.json (usable_capacity_kwh, in_container_mass_kg, continuous_power_kw, …)
 * and the brief's hard targets, and caps the score deterministically. Universal.
 *
 * CLI: npx tsx scripts/brief-adherence.ts <state.json>  → JSON verdict (exit 0)
 */
import { readFileSync } from 'fs'
import { checkBriefFeasibility } from '../src/lib/pdf-engine-v2/lib/brief-feasibility-gate'

interface Breach {
  constraint: string
  brief: number
  achieved: number
  unit: string
  direction: 'max' | 'min'
  pct: number
}

export interface BriefAdherenceVerdict {
  all_hard_met: boolean
  breaches: Breach[]
  brief_infeasible: boolean
  /** null = no cap (all hard constraints met). Otherwise the max score this run may earn. */
  recommended_cap: number | null
  reason: string
}

const TOL = 0.02 // 2% — ignore rounding-level misses

// brief metric key → achieved quantity key(s) + scale to the achieved unit + direction.
// 'min' = brief is a floor (energy/power), breached when achieved is below it.
const METRIC_MAP: Record<string, { qty: string[]; toAchieved: number; dir: 'min' | 'max' }> = {
  usable_energy_mwh: { qty: ['usable_capacity_kwh'], toAchieved: 1000, dir: 'min' },
  usable_energy_kwh: { qty: ['usable_capacity_kwh'], toAchieved: 1, dir: 'min' },
  nameplate_capacity_mwh: { qty: ['nameplate_capacity_kwh'], toAchieved: 1000, dir: 'min' },
  nameplate_capacity_kwh: { qty: ['nameplate_capacity_kwh'], toAchieved: 1, dir: 'min' },
  continuous_power_mw: { qty: ['continuous_power_kw'], toAchieved: 1000, dir: 'min' },
  continuous_power_kw: { qty: ['continuous_power_kw'], toAchieved: 1, dir: 'min' },
  peak_power_mw: { qty: ['peak_power_kw'], toAchieved: 1000, dir: 'min' },
}

function qv(q: any, keys: string[]): number | null {
  for (const k of keys) {
    const v = q?.[k]?.value ?? q?.[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return null
}

export function checkBriefAdherence(state: any): BriefAdherenceVerdict {
  const constraints = state?.parsedBrief?.constraints ?? {}
  const q = state?.orchestratorContract?.quantities ?? state?.engineeringContract?.quantities ?? {}
  const breaches: Breach[] = []

  // Performance metrics (energy / power floors).
  const tp = constraints?.target_performance
  const metrics: any[] = Array.isArray(tp?.metrics) ? tp.metrics : tp ? [tp] : []
  for (const m of metrics) {
    const key = String(m?.key_metric ?? '').toLowerCase()
    const map = METRIC_MAP[key]
    if (!map || typeof m?.value !== 'number') continue
    const briefInAchieved = m.value * map.toAchieved
    const achieved = qv(q, map.qty)
    if (achieved == null) continue
    if (map.dir === 'min' && achieved < briefInAchieved * (1 - TOL)) {
      breaches.push({ constraint: key, brief: briefInAchieved, achieved, unit: 'kWh/kW', direction: 'min', pct: ((achieved - briefInAchieved) / briefInAchieved) * 100 })
    }
  }

  // Mass cap (ceiling).
  const massCap = constraints?.max_mass_kg?.value
  const achievedMass = qv(q, ['in_container_mass_kg', 'system_mass_with_external_kg', 'total_system_mass_kg'])
  if (typeof massCap === 'number' && achievedMass != null && achievedMass > massCap * (1 + TOL)) {
    breaches.push({ constraint: 'max_mass_kg', brief: massCap, achieved: achievedMass, unit: 'kg', direction: 'max', pct: ((achievedMass - massCap) / massCap) * 100 })
  }

  // Cost ceiling (ceiling) — only when the achieved cost is present in state.
  const costCeiling = constraints?.unit_cost_ceiling?.value
  const cs = state?.costStack ?? {}
  const achievedCost =
    typeof cs.oem_transfer_price_gbp === 'number' && cs.oem_transfer_price_gbp > 0
      ? cs.oem_transfer_price_gbp
      : typeof cs.installed_asp_gbp === 'number' && cs.installed_asp_gbp > 0
        ? cs.installed_asp_gbp
        : null
  if (typeof costCeiling === 'number' && achievedCost != null && achievedCost > costCeiling * (1 + TOL)) {
    breaches.push({ constraint: 'unit_cost_ceiling', brief: costCeiling, achieved: achievedCost, unit: 'GBP', direction: 'max', pct: ((achievedCost - costCeiling) / costCeiling) * 100 })
  }

  const productClass = String(state?.moduleDecomposition?.product_class ?? state?.parsedBrief?.product_class ?? '')
  const brief_infeasible = checkBriefFeasibility(state, productClass).feasible === false

  const all_hard_met = breaches.length === 0
  // A breached MEETABLE brief = a design failure (hard cap). A breached but
  // INFEASIBLE brief = the brief's fault, but the customer's requirement is still
  // unmet, so it cannot be a clean 8+ either (softer cap).
  const recommended_cap = all_hard_met ? null : brief_infeasible ? 7.0 : 6.0

  return {
    all_hard_met,
    breaches,
    brief_infeasible,
    recommended_cap,
    reason: all_hard_met
      ? 'design meets all extractable hard brief constraints'
      : `${breaches.length} hard constraint(s) breached: ${breaches
          .map((b) => `${b.constraint} ${Math.round(b.achieved)} vs brief ${Math.round(b.brief)} (${b.pct > 0 ? '+' : ''}${b.pct.toFixed(0)}%)`)
          .join('; ')}${brief_infeasible ? ' — NOTE brief itself flagged infeasible' : ''}. Score capped to ${recommended_cap}.`,
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const argv1 = process.argv[1] ?? ''
if (/brief-adherence\.(?:ts|js|mjs|cjs)$/.test(argv1)) {
  const path = process.argv[2]
  if (!path) {
    console.error('usage: npx tsx scripts/brief-adherence.ts <state.json>')
    process.exit(1)
  }
  try {
    const state = JSON.parse(readFileSync(path, 'utf-8'))
    console.log(JSON.stringify(checkBriefAdherence(state), null, 2))
  } catch (err) {
    console.error(`[brief-adherence] failed: ${(err as Error).message}`)
    process.exit(1)
  }
}
