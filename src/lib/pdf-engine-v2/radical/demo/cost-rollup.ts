/**
 * @file radical/demo/cost-rollup.ts
 *
 * Cost rollup for the BESS Radical demo.
 *
 * Walks the resolved tree from archetypes up through characters, words (subsystems),
 * and sentences (system). At each level applies an assembly markup:
 *
 *   Archetype level:  base leaf costs (unit_price × qty)
 *   Character level:  +15% (PCB assembly / component integration typical)
 *   Word level:       +20% (subsystem integration — wiring, testing, commissioning)
 *   Sentence level:   +25% (system integration — container fit-out, commissioning)
 *
 * Maps BESS modules from decomposition-bess.json to word-level groupings.
 */

import type { ResolvedLeaf } from './resolution.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ArchetypeCost {
  archetype_id: string
  name: string
  qty: number
  unit_price_gbp: number | null
  line_total_gbp: number | null
  verification_grade: string
}

export interface WordCost {
  module_id: string
  module_label: string
  archetype_costs: ArchetypeCost[]
  subtotal_parts_gbp: number
  markup_pct: number
  markup_gbp: number
  total_gbp: number
}

export interface CostRollup {
  archetypes: ArchetypeCost[]
  words: WordCost[]
  sentence: {
    id: string
    label: string
    word_subtotal_gbp: number
    sentence_markup_pct: number
    sentence_markup_gbp: number
    total_gbp: number
    top_cost_drivers: Array<{ name: string; total_gbp: number; pct_of_system: number }>
  }
}

// ---------------------------------------------------------------------------
// Module (word-level) groupings from decomposition-bess.json
// ---------------------------------------------------------------------------

const MODULE_LABELS: Record<string, string> = {
  battery_rack_assembly: 'Battery Rack Assembly',
  battery_management_system_bms: 'Battery Management System (BMS)',
  power_conversion_system_pcs: 'Power Conversion System (PCS)',
  dc_distribution_switchgear: 'DC Distribution & Switchgear',
  thermal_management_system: 'Thermal Management System',
  container_enclosure_fit_out: 'Container Enclosure & Fit-Out',
  fire_detection_and_suppression_system_fss: 'Fire Detection & Suppression System',
  energy_management_system_ems_scada: 'EMS / SCADA',
}

// Hard-code the module for each line_id (from decomposition-bess.json)
const LINE_MODULE_MAP: Record<number, string> = {
  1:  'battery_rack_assembly',
  2:  'battery_rack_assembly',
  3:  'battery_management_system_bms',
  4:  'battery_management_system_bms',
  5:  'power_conversion_system_pcs',
  6:  'power_conversion_system_pcs',
  7:  'dc_distribution_switchgear',
  8:  'dc_distribution_switchgear',
  9:  'dc_distribution_switchgear',
  10: 'dc_distribution_switchgear',
  11: 'dc_distribution_switchgear',
  12: 'dc_distribution_switchgear',
  13: 'dc_distribution_switchgear',
  14: 'thermal_management_system',
  15: 'container_enclosure_fit_out',
  16: 'fire_detection_and_suppression_system_fss',
  17: 'fire_detection_and_suppression_system_fss',
  18: 'fire_detection_and_suppression_system_fss',
  19: 'fire_detection_and_suppression_system_fss',
  20: 'energy_management_system_ems_scada',
  21: 'energy_management_system_ems_scada',
  22: 'energy_management_system_ems_scada',
  23: 'container_enclosure_fit_out',
  24: 'container_enclosure_fit_out',
  25: 'container_enclosure_fit_out',
}

// ---------------------------------------------------------------------------
// Markup rates
// ---------------------------------------------------------------------------

const CHARACTER_MARKUP_PCT = 0.15   // PCB/component assembly
const WORD_MARKUP_PCT      = 0.20   // Subsystem integration
const SENTENCE_MARKUP_PCT  = 0.25   // System integration

// ---------------------------------------------------------------------------
// Main rollup function
// ---------------------------------------------------------------------------

export function computeCostRollup(resolvedLeaves: ResolvedLeaf[]): CostRollup {
  // ── Archetype level ────────────────────────────────────────────────────────
  const archetypes: ArchetypeCost[] = resolvedLeaves.map(leaf => {
    const lineTotalGbp =
      leaf.unit_price_gbp !== null ? leaf.unit_price_gbp * leaf.qty : null
    return {
      archetype_id: leaf.archetype_id,
      name: leaf.name,
      qty: leaf.qty,
      unit_price_gbp: leaf.unit_price_gbp,
      line_total_gbp: lineTotalGbp,
      verification_grade: leaf.verification_grade,
    }
  })

  // ── Word (module/subsystem) level ──────────────────────────────────────────
  const moduleGroups: Map<string, ArchetypeCost[]> = new Map()
  for (const a of archetypes) {
    const lineId = resolvedLeaves.find(l => l.archetype_id === a.archetype_id)?.line_id ?? 0
    const moduleId = LINE_MODULE_MAP[lineId] ?? 'unknown'
    if (!moduleGroups.has(moduleId)) moduleGroups.set(moduleId, [])
    moduleGroups.get(moduleId)!.push(a)
  }

  const words: WordCost[] = []
  for (const [moduleId, archCosts] of moduleGroups) {
    const subtotalParts = archCosts.reduce((sum, a) => sum + (a.line_total_gbp ?? 0), 0)

    // Apply character-level markup first (already rolled up in subtotalParts as assembly cost)
    const afterCharacterMarkup = subtotalParts * (1 + CHARACTER_MARKUP_PCT)

    // Word-level integration markup
    const wordMarkupGbp = afterCharacterMarkup * WORD_MARKUP_PCT

    words.push({
      module_id: moduleId,
      module_label: MODULE_LABELS[moduleId] ?? moduleId,
      archetype_costs: archCosts,
      subtotal_parts_gbp: subtotalParts,
      markup_pct: (CHARACTER_MARKUP_PCT + WORD_MARKUP_PCT) * 100, // blended
      markup_gbp: subtotalParts * CHARACTER_MARKUP_PCT + wordMarkupGbp,
      total_gbp: afterCharacterMarkup + wordMarkupGbp,
    })
  }

  // ── Sentence (system) level ────────────────────────────────────────────────
  const wordSubtotal = words.reduce((sum, w) => sum + w.total_gbp, 0)
  const sentenceMarkupGbp = wordSubtotal * SENTENCE_MARKUP_PCT
  const systemTotal = wordSubtotal + sentenceMarkupGbp

  // Top 3 cost drivers (by archetype line total)
  const allArchetypeCosts = [...archetypes]
    .filter(a => a.line_total_gbp !== null)
    .sort((a, b) => (b.line_total_gbp ?? 0) - (a.line_total_gbp ?? 0))
    .slice(0, 3)

  const topCostDrivers = allArchetypeCosts.map(a => ({
    name: a.name,
    total_gbp: a.line_total_gbp ?? 0,
    pct_of_system: systemTotal > 0 ? ((a.line_total_gbp ?? 0) / systemTotal) * 100 : 0,
  }))

  console.log(`\n[cost-rollup] System total: £${systemTotal.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`)
  console.log(`[cost-rollup] Top driver: ${topCostDrivers[0]?.name} (${topCostDrivers[0]?.pct_of_system.toFixed(1)}%)`)

  return {
    archetypes,
    words,
    sentence: {
      id: 'bess_container_3_5mwh',
      label: 'BESS Container 3.5 MWh / 1 MW System',
      word_subtotal_gbp: wordSubtotal,
      sentence_markup_pct: SENTENCE_MARKUP_PCT * 100,
      sentence_markup_gbp: sentenceMarkupGbp,
      total_gbp: systemTotal,
      top_cost_drivers: topCostDrivers,
    },
  }
}

// ---------------------------------------------------------------------------
// Verification: sample 3 nodes and check the math
// ---------------------------------------------------------------------------

export function verifyCostRollupSample(rollup: CostRollup): string[] {
  const checks: string[] = []
  const samples = rollup.archetypes
    .filter(a => a.unit_price_gbp !== null)
    .slice(0, 3)

  for (const a of samples) {
    const expected = (a.unit_price_gbp ?? 0) * a.qty
    const actual = a.line_total_gbp ?? 0
    const match = Math.abs(expected - actual) < 0.01
    checks.push(
      `${a.name}: ${a.qty} × £${a.unit_price_gbp?.toFixed(2)} = £${expected.toFixed(2)} ` +
      `(recorded £${actual.toFixed(2)}) → ${match ? 'PASS' : 'FAIL'}`
    )
  }

  // Check one word total
  const word = rollup.words[0]
  if (word) {
    const expectedAfterChar = word.subtotal_parts_gbp * (1 + 0.15)
    const expectedWordMarkup = expectedAfterChar * 0.20
    const expectedWordTotal = expectedAfterChar + expectedWordMarkup
    const actualTotal = word.total_gbp
    const match = Math.abs(expectedWordTotal - actualTotal) < 1
    checks.push(
      `Module "${word.module_label}": parts £${word.subtotal_parts_gbp.toFixed(0)} × 1.15 × 1.20 = ` +
      `£${expectedWordTotal.toFixed(0)} (recorded £${actualTotal.toFixed(0)}) → ${match ? 'PASS' : 'FAIL'}`
    )
  }

  return checks
}
