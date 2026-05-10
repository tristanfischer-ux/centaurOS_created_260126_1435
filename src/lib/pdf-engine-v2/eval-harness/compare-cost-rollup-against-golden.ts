#!/usr/bin/env npx tsx
/**
 * @file eval-harness/compare-cost-rollup-against-golden.ts
 *
 * Phase 3 Cost Rollup Comparator.
 *
 * Diffs radicalCostSummary.bomTotal against the frozen BESS golden snapshot
 * (golden/bess-container/baseline-bom.json).
 *
 * Reports:
 *   - radicalCostSummary.bomTotal (Radical Phase 3 fully-loaded total)
 *   - Demo cost rollup reference: £820,637 (system total, from demo run)
 *   - Golden snapshot total: from baseline-bom.json (known_parts_total_gbp = £191,010)
 *   - Tolerance vs demo: ±10% (Phase 2 LLM prices may differ from demo Grade D prices)
 *   - Per-sentence top-driver agreement
 *
 * The ±10% tolerance vs demo is intentional — Phase 2 uses live distributor
 * prices that differ from the demo's Grade D table. The demo total (£820,637)
 * includes system-level markups; the golden snapshot (£191,010) is raw parts only.
 *
 * Exits 0 on pass, 1 on fail.
 *
 * Usage:
 *   RADICAL_PHASE_1_TREE_OUTPUT=true \
 *   RADICAL_PHASE_2_RESOLUTION=true \
 *   RADICAL_PHASE_3_COSTROLLUP=true \
 *   OPENROUTER_API_KEY=... \
 *   npx tsx src/lib/pdf-engine-v2/eval-harness/compare-cost-rollup-against-golden.ts
 *
 * Or pass a pre-computed radicalCostSummary JSON:
 *   npx tsx .../compare-cost-rollup-against-golden.ts --cost-summary /tmp/radical-cost.json
 */

import { readFileSync } from 'fs'
import { resolve, join } from 'path'

// ---------------------------------------------------------------------------
// Env loading (mirrors compare-resolution-against-golden.ts pattern)
// ---------------------------------------------------------------------------

try {
  const envPath = resolve(process.cwd(), '.env.local')
  const envContent = readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...valueParts] = trimmed.split('=')
      const value = valueParts.join('=').replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = value
    }
  }
} catch { /* no .env.local */ }

try {
  const secretsPath = resolve(process.env.HOME ?? '', '.claude/secrets/distributor-apis.env')
  const envContent = readFileSync(secretsPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...valueParts] = trimmed.split('=')
      const value = valueParts.join('=').replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = value
    }
  }
} catch { /* secrets not present */ }

import { runDecomposeRadical } from '../stages/2-decompose.js'
import { runRadicalResolution } from '../stages/4b-radical-resolution.js'
import { runRadicalCostRollup, type RadicalCostSummary } from '../stages/4c-radical-cost-rollup.js'
import type { GoldenSnapshot } from './compare-against-golden.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Demo cost rollup on BESS (from radical/demo/cost-rollup.ts + Grade D prices). */
const DEMO_SYSTEM_TOTAL_GBP = 820_637

/** Per-class flat sum (Stage 4 without markups). */
const PER_CLASS_FLAT_SUM_GBP = 900_410

/** Tolerance vs demo output (Phase 2 uses live distributor prices, may differ). */
const TOLERANCE_VS_DEMO_PCT = 10

// ---------------------------------------------------------------------------
// Minimal parsed brief (mirrors compare-resolution-against-golden.ts pattern)
// ---------------------------------------------------------------------------

function buildMinimalBessParsedBrief() {
  return {
    project_id: 'bess-cost-rollup-comparator',
    product_description: 'BESS Container 3.5 MWh / 1 MW, 40-ft ISO, LFP prismatic',
    mission_statement: 'Factory-assembled 3.5 MWh / 1 MW BESS for UK grid-scale frequency response',
    target_customers: 'UK grid operators, C&I peak-shaving customers',
    why_now: 'UK grid balancing market growth, falling LFP cell prices',
    constraints: {
      unit_cost_ceiling: { value: 180000, currency: 'GBP' as const, source: 'user' as const },
      max_mass_kg: { value: 28000, source: 'user' as const },
      max_dimensions_mm: { w: 12192, d: 2438, h: 2896, source: 'user' as const },
      target_performance: { key_metric: 'usable_energy_kwh', value: 3500, unit: 'kWh', source: 'user' as const },
      target_process: { value: 'containerised assembly', source: 'user' as const },
      target_material: { value: 'LFP prismatic', source: 'user' as const },
      batch_size: { value: 25, source: 'user' as const },
      design_life: { value: '15 years or 6000 cycles', source: 'user' as const },
      operating_environment: { temp_min_c: -20, temp_max_c: 50, source: 'user' as const },
      safety_standards: [
        { standard: 'IEC 62619', code: 'IEC 62619:2022', source_grade: 'A' as const, source: 'user' as const },
        { standard: 'UL 9540A', code: 'UL 9540A', source_grade: 'A' as const, source: 'user' as const },
        { standard: 'G99 Issue 6', code: 'G99', source_grade: 'A' as const, source: 'user' as const },
      ],
      additional_constraints: [
        { description: 'DC bus voltage ~800 V nominal', source: 'user' as const },
        { description: 'AC output 400 V / 50 Hz', source: 'user' as const },
        { description: 'LFP prismatic CATL 280 Ah cells', source: 'user' as const },
      ],
    },
    missing_mandatory_fields: [],
    confidence: 'HIGH' as const,
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CostRollupComparisonResult {
  passed: boolean
  bomTotal: number
  demoReference: number
  goldenPartsTotal: number
  diffVsDemo: number
  diffVsDemoPct: number
  withinDemoTolerance: boolean
  diffVsGoldenParts: number
  diffVsGoldenPartsPct: number
  topDrivers: Array<{ partName: string; totalGbp: number; pct: number }>
  sentenceBreakdown: Array<{ sentenceId: string; label: string; total: number; pctOfBoM: number }>
  pricedLeaves: number
  totalLeaves: number
  failures: string[]
  warnings: string[]
}

// ---------------------------------------------------------------------------
// Main comparison
// ---------------------------------------------------------------------------

function compareRollupAgainstGolden(
  summary: RadicalCostSummary,
  golden: GoldenSnapshot,
): CostRollupComparisonResult {
  const failures: string[] = []
  const warnings: string[] = []

  const bomTotal = summary.bomTotal
  const diffVsDemo = bomTotal - DEMO_SYSTEM_TOTAL_GBP
  const diffVsDemoPct = Math.abs(diffVsDemo) / DEMO_SYSTEM_TOTAL_GBP * 100
  const withinDemoTolerance = diffVsDemoPct <= TOLERANCE_VS_DEMO_PCT

  const goldenPartsTotal = golden.known_parts_total_gbp
  const diffVsGoldenParts = bomTotal - goldenPartsTotal
  const diffVsGoldenPartsPct = goldenPartsTotal > 0
    ? Math.abs(diffVsGoldenParts) / goldenPartsTotal * 100
    : 0

  if (!withinDemoTolerance) {
    failures.push(
      `BoM total £${bomTotal.toLocaleString('en-GB', { maximumFractionDigits: 0 })} is ${diffVsDemoPct.toFixed(1)}% ` +
      `away from demo reference £${DEMO_SYSTEM_TOTAL_GBP.toLocaleString('en-GB', { maximumFractionDigits: 0 })} ` +
      `(tolerance: ±${TOLERANCE_VS_DEMO_PCT}%)`
    )
  }

  // Top driver alignment check
  const topDrivers = summary.topDrivers
  if (topDrivers.length === 0) {
    failures.push('No top drivers identified — cost rollup may have failed')
  } else if (topDrivers.length < 3) {
    warnings.push(`Only ${topDrivers.length} top driver(s) identified — expected ≥3`)
  }

  // Sentence breakdown
  const sentenceBreakdown = summary.radicalHierarchy.sentences.map(s => ({
    sentenceId: s.sentenceId,
    label: s.label,
    total: s.sentenceTotal,
    pctOfBoM: bomTotal > 0 ? (s.sentenceTotal / bomTotal) * 100 : 0,
  }))

  // Sanity: bomTotal should be greater than raw golden parts total (due to markups)
  if (bomTotal <= goldenPartsTotal && goldenPartsTotal > 0) {
    warnings.push(
      `BoM total £${bomTotal.toLocaleString('en-GB', { maximumFractionDigits: 0 })} ≤ ` +
      `golden parts total £${goldenPartsTotal.toLocaleString('en-GB', { maximumFractionDigits: 0 })} — ` +
      `markups may not have been applied correctly`
    )
  }

  // Priced leaf coverage
  const { priced_leaves, total_leaves } = summary.radicalMeta
  const pricedFraction = total_leaves > 0 ? priced_leaves / total_leaves : 0
  if (pricedFraction < 0.5) {
    warnings.push(`Only ${priced_leaves}/${total_leaves} leaves have prices — cost may be significantly underestimated`)
  }

  return {
    passed: failures.length === 0,
    bomTotal,
    demoReference: DEMO_SYSTEM_TOTAL_GBP,
    goldenPartsTotal,
    diffVsDemo,
    diffVsDemoPct,
    withinDemoTolerance,
    diffVsGoldenParts,
    diffVsGoldenPartsPct,
    topDrivers,
    sentenceBreakdown,
    pricedLeaves: priced_leaves,
    totalLeaves: total_leaves,
    failures,
    warnings,
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2)
  const costSummaryArg = args.indexOf('--cost-summary')

  let summary: RadicalCostSummary

  if (costSummaryArg !== -1 && args[costSummaryArg + 1]) {
    // Load pre-computed summary from file
    const filePath = resolve(args[costSummaryArg + 1])
    console.log(`[comparator] Loading radicalCostSummary from ${filePath}`)
    summary = JSON.parse(readFileSync(filePath, 'utf-8'))
  } else {
    // Run Phase 1.5 + Phase 2 + Phase 3 live
    console.log('[comparator] Running Phase 1.5 + Phase 2 + Phase 3 for BESS...')

    process.env.RADICAL_PHASE_1_TREE_OUTPUT = 'true'
    process.env.RADICAL_PHASE_2_RESOLUTION = 'true'
    process.env.RADICAL_PHASE_3_COSTROLLUP = 'true'

    const parsedBrief = buildMinimalBessParsedBrief()

    console.log('[comparator] Running runDecomposeRadical...')
    const radicalResult = await runDecomposeRadical(parsedBrief as any, 'battery_energy_storage')

    if (!radicalResult.ok || !radicalResult.data) {
      console.error(`[comparator] ERROR: Phase 1.5 decomposition failed: ${radicalResult.error}`)
      process.exit(1)
    }

    const radicalTree = radicalResult.data.tree
    console.log(`[comparator] Phase 1.5 tree: ${radicalResult.data.leafCount ?? 0} leaves placed, ${radicalResult.data.unknowns.length} unknowns`)

    // Phase 2 resolution
    console.log('[comparator] Running Phase 2 resolution...')
    const resolvedTree = await runRadicalResolution(radicalTree, 'battery_energy_storage')
    console.log(`[comparator] Phase 2 complete. Distributor calls: ${resolvedTree.resolution_meta.distributor_calls_made}`)

    // Phase 3 cost rollup
    console.log('[comparator] Running Phase 3 cost rollup...')
    const ceilingGbp = parsedBrief.constraints.unit_cost_ceiling.value
    summary = runRadicalCostRollup(resolvedTree, ceilingGbp)
    console.log(`[comparator] Phase 3 complete. BoM total: £${summary.bomTotal.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`)
  }

  // Load golden
  const goldenPath = join(
    process.cwd(),
    'src/lib/pdf-engine-v2/eval-harness/golden/bess-container/baseline-bom.json'
  )
  const golden: GoldenSnapshot = JSON.parse(readFileSync(goldenPath, 'utf-8'))

  // Compare
  const result = compareRollupAgainstGolden(summary, golden)

  // ── Report ─────────────────────────────────────────────────────────────────

  console.log('\n' + '='.repeat(70))
  console.log('PHASE 3 COST ROLLUP COMPARATOR — BESS')
  console.log('='.repeat(70))

  console.log(`\nStatus:          ${result.passed ? 'PASS' : 'FAIL'}`)
  console.log(`\nRadical BoM total:     £${result.bomTotal.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`)
  console.log(`Demo reference:        £${result.demoReference.toLocaleString('en-GB', { maximumFractionDigits: 0 })} (Phase 0 demo rollup)`)
  console.log(`Per-class flat sum:    £${PER_CLASS_FLAT_SUM_GBP.toLocaleString('en-GB', { maximumFractionDigits: 0 })} (Stage 4, no markups)`)
  console.log(`Golden parts total:    £${result.goldenPartsTotal.toLocaleString('en-GB', { maximumFractionDigits: 0 })} (baseline-bom.json raw parts)`)

  console.log(`\nvs Demo (±${TOLERANCE_VS_DEMO_PCT}% tolerance):`)
  console.log(`  Diff:  £${Math.abs(result.diffVsDemo).toLocaleString('en-GB', { maximumFractionDigits: 0 })} (${result.diffVsDemoPct.toFixed(1)}%)  →  ${result.withinDemoTolerance ? 'WITHIN tolerance' : 'OUTSIDE tolerance'}`)

  console.log(`\nvs Golden raw parts:`)
  console.log(`  Diff:  £${Math.abs(result.diffVsGoldenParts).toLocaleString('en-GB', { maximumFractionDigits: 0 })} (${result.diffVsGoldenPartsPct.toFixed(1)}%)`)
  console.log(`  (Expected: BoM total > golden parts due to markups)`)

  console.log(`\nLeaf coverage: ${result.pricedLeaves}/${result.totalLeaves} priced (${(result.pricedLeaves / Math.max(result.totalLeaves, 1) * 100).toFixed(0)}%)`)

  if (result.topDrivers.length > 0) {
    console.log('\nTop cost drivers:')
    for (const driver of result.topDrivers) {
      console.log(
        `  £${driver.totalGbp.toLocaleString('en-GB', { maximumFractionDigits: 0 }).padStart(10)} ` +
        `(${driver.pct.toFixed(1).padStart(5)}%)  ${driver.partName}`
      )
    }
  }

  if (result.sentenceBreakdown.length > 0) {
    console.log('\nSentence (module) breakdown:')
    for (const s of result.sentenceBreakdown) {
      console.log(
        `  £${s.total.toLocaleString('en-GB', { maximumFractionDigits: 0 }).padStart(10)} ` +
        `(${s.pctOfBoM.toFixed(1).padStart(5)}%)  ${s.label}`
      )
    }
  }

  if (result.warnings.length > 0) {
    console.log('\nWarnings:')
    for (const w of result.warnings) console.log(`  WARN ${w}`)
  }

  if (result.failures.length > 0) {
    console.log('\nFailures:')
    for (const f of result.failures) console.log(`  FAIL ${f}`)
  }

  console.log(`\nRadical meta:`)
  console.log(`  Character markup: ${summary.radicalMeta.character_markup_pct}%`)
  console.log(`  Word markup:      ${summary.radicalMeta.word_markup_pct}%`)
  console.log(`  Sentence markup:  ${summary.radicalMeta.sentence_markup_pct}%`)
  console.log(`  Computed at:      ${summary.radicalMeta.computed_at}`)

  console.log('\n' + '='.repeat(70))
  console.log(result.passed ? 'RESULT: PASS' : 'RESULT: FAIL')
  console.log('='.repeat(70) + '\n')

  process.exit(result.passed ? 0 : 1)
}

main().catch(err => {
  console.error('[comparator] Fatal error:', err)
  process.exit(1)
})
