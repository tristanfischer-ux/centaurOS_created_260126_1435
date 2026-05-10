#!/usr/bin/env npx tsx
/**
 * @file eval-harness/determinism-test-grammar.ts
 *
 * Phase 4 — Grammar Engine Determinism Test.
 *
 * Runs Phase 1.5 + Phase 2 + Phase 3 + Phase 4 TWICE on the BESS brief and
 * diffs the two GrammarPassState outputs. Exits 1 on any difference.
 *
 * Phase 4 is PURELY DETERMINISTIC (zero LLM calls):
 *   - Phases 1.5/2/3 produce identical resolved trees (proven by
 *     determinism-test-resolution.ts)
 *   - Grammar rules are pure functions of the resolved tree + environment
 *   - No random number generation, no timestamps in rule logic
 *
 * Therefore: Phase 4 must produce ZERO verdict diffs across runs.
 *
 * Expected BESS output:
 *   - 6 rules fired
 *   - 5 PASS, 1 WARN (LFP voltage derate — transformer at 100% of rated)
 *   - Overall verdict: PASS_WITH_RELAXATION or PASS (depending on derate ratio)
 *   - Zero BLOCKs (BESS is indoor, non-marine — marine/galvanic rules PASS)
 *
 * Usage:
 *   RADICAL_PHASE_1_TREE_OUTPUT=true \
 *   RADICAL_PHASE_2_RESOLUTION=true \
 *   RADICAL_PHASE_3_COSTROLLUP=true \
 *   RADICAL_PHASE_4_GRAMMAR=true \
 *   npx tsx src/lib/pdf-engine-v2/eval-harness/determinism-test-grammar.ts
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

// ---------------------------------------------------------------------------
// Env loading — mirrors determinism-test-resolution.ts
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

// Force all four flags on for the test
process.env.RADICAL_PHASE_1_TREE_OUTPUT = 'true'
process.env.RADICAL_PHASE_2_RESOLUTION = 'true'
process.env.RADICAL_PHASE_3_COSTROLLUP = 'true'
process.env.RADICAL_PHASE_4_GRAMMAR = 'true'

import { runDecomposeRadical } from '../stages/2-decompose.js'
import { runRadicalResolution } from '../stages/4b-radical-resolution.js'
import { runRadicalCostRollup } from '../stages/4c-radical-cost-rollup.js'
import { runRadicalGrammar, type GrammarPassState } from '../stages/4d-radical-grammar.js'

// ---------------------------------------------------------------------------
// BESS parsed brief — mirrors determinism-test-resolution.ts
// ---------------------------------------------------------------------------

function buildMinimalBessParsedBrief() {
  return {
    project_id: 'bess-grammar-determinism-test',
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
// Verdict diff
// ---------------------------------------------------------------------------

interface VerdictDiff {
  rule_id: string
  field: string
  run1: unknown
  run2: unknown
}

function diffGrammarResults(
  result1: GrammarPassState,
  result2: GrammarPassState,
): VerdictDiff[] {
  const diffs: VerdictDiff[] = []

  // Overall verdict
  if (result1.overall_verdict !== result2.overall_verdict) {
    diffs.push({ rule_id: 'OVERALL', field: 'overall_verdict', run1: result1.overall_verdict, run2: result2.overall_verdict })
  }

  // Rule count
  if (result1.rules_fired !== result2.rules_fired) {
    diffs.push({ rule_id: 'OVERALL', field: 'rules_fired', run1: result1.rules_fired, run2: result2.rules_fired })
    return diffs // Cannot compare rule-by-rule if counts differ
  }

  // Per-rule comparison
  const verdicts1 = [...result1.verdicts].sort((a, b) => a.rule_id.localeCompare(b.rule_id))
  const verdicts2 = [...result2.verdicts].sort((a, b) => a.rule_id.localeCompare(b.rule_id))

  for (let i = 0; i < verdicts1.length; i++) {
    const v1 = verdicts1[i]
    const v2 = verdicts2[i]

    if (v1.rule_id !== v2.rule_id) {
      diffs.push({ rule_id: `[${i}]`, field: 'rule_id', run1: v1.rule_id, run2: v2.rule_id })
      continue
    }

    const id = v1.rule_id

    if (v1.verdict !== v2.verdict) {
      diffs.push({ rule_id: id, field: 'verdict', run1: v1.verdict, run2: v2.verdict })
    }
    if (v1.relaxed !== v2.relaxed) {
      diffs.push({ rule_id: id, field: 'relaxed', run1: v1.relaxed, run2: v2.relaxed })
    }
    if ((v1.relaxation_cost ?? null) !== (v2.relaxation_cost ?? null)) {
      diffs.push({ rule_id: id, field: 'relaxation_cost', run1: v1.relaxation_cost, run2: v2.relaxation_cost })
    }

    // Reason must match exactly (deterministic rule evaluation)
    if (v1.reason !== v2.reason) {
      diffs.push({ rule_id: id, field: 'reason', run1: v1.reason.slice(0, 80), run2: v2.reason.slice(0, 80) })
    }

    // Affected nodes must match (order-insensitive)
    const nodes1 = [...v1.affected_nodes].sort().join(',')
    const nodes2 = [...v2.affected_nodes].sort().join(',')
    if (nodes1 !== nodes2) {
      diffs.push({ rule_id: id, field: 'affected_nodes', run1: nodes1, run2: nodes2 })
    }
  }

  return diffs
}

// ---------------------------------------------------------------------------
// One full grammar run: Phase 1.5 → 2 → 3 → 4
// ---------------------------------------------------------------------------

async function runOneGrammarPass(runLabel: string): Promise<GrammarPassState> {
  const parsedBrief = buildMinimalBessParsedBrief()

  console.log(`\n[determinism-grammar] ─── ${runLabel} ───────────────────────────────`)

  // Phase 1.5: tree decomposition
  const decompResult = await runDecomposeRadical(parsedBrief as any, 'battery_energy_storage')
  if (!decompResult.ok || !decompResult.data) {
    throw new Error(`[${runLabel}] Phase 1.5 tree decomposition failed: ${decompResult.error}`)
  }
  const radicalTree = decompResult.data.tree
  console.log(`[${runLabel}] Phase 1.5: tree emitted (${radicalTree.composition.root.children?.length ?? 0} top-level nodes)`)

  // Phase 2: resolution
  const productClass = 'battery_energy_storage'
  const resolvedTree = await runRadicalResolution(radicalTree, productClass)
  console.log(`[${runLabel}] Phase 2: resolved (${resolvedTree.resolution_meta.stats.total_leaves} leaves)`)

  // Phase 3: cost rollup
  const ceilingGbp = parsedBrief.constraints.unit_cost_ceiling.value
  const costSummary = runRadicalCostRollup(resolvedTree, ceilingGbp)
  console.log(
    `[${runLabel}] Phase 3: cost rollup done. ` +
    `BoM total: £${costSummary.finalUnitCost.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`
  )

  // Phase 4: grammar
  const grammarResult = runRadicalGrammar(resolvedTree, costSummary)
  console.log(
    `[${runLabel}] Phase 4: grammar done. ` +
    `Overall: ${grammarResult.overall_verdict} | PASS: ${grammarResult.pass_count} WARN: ${grammarResult.warn_count} BLOCK: ${grammarResult.block_count}`
  )

  return grammarResult
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('\n══════════════════════════════════════════════════════════')
  console.log(' Phase 4 — Grammar Determinism Test (BESS × 2 runs)')
  console.log('══════════════════════════════════════════════════════════')

  let result1: GrammarPassState
  let result2: GrammarPassState

  try {
    result1 = await runOneGrammarPass('Run 1')
  } catch (err) {
    console.error(`\n[determinism-grammar] ✗ Run 1 FAILED: ${(err as Error).message}`)
    process.exit(1)
  }

  try {
    result2 = await runOneGrammarPass('Run 2')
  } catch (err) {
    console.error(`\n[determinism-grammar] ✗ Run 2 FAILED: ${(err as Error).message}`)
    process.exit(1)
  }

  // ── Diff ─────────────────────────────────────────────────────────────────
  console.log('\n[determinism-grammar] ─── Diff ──────────────────────────────────────')

  const diffs = diffGrammarResults(result1, result2)

  if (diffs.length === 0) {
    console.log('[determinism-grammar] ✓ PASS — Zero diffs between Run 1 and Run 2')
    console.log(`[determinism-grammar] ✓ Overall verdict: ${result1.overall_verdict}`)
    console.log(`[determinism-grammar] ✓ Rules fired: ${result1.rules_fired}`)
    console.log(`[determinism-grammar] ✓ PASS: ${result1.pass_count} | WARN: ${result1.warn_count} | BLOCK: ${result1.block_count}`)
    console.log(`[determinism-grammar] ✓ Relaxations applied: ${result1.relaxations_applied}`)

    // Show all verdicts for inspection
    console.log('\n[determinism-grammar] Verdict summary:')
    for (const v of result1.verdicts) {
      const relaxedMark = v.relaxed ? ' [RELAXED]' : ''
      const weightStr = v.weight === Infinity ? '∞' : String(v.weight)
      console.log(
        `  ${v.verdict}${relaxedMark.padEnd(10)} [w=${weightStr}, ${v.hardness.padEnd(10)}] ${v.rule_id}`
      )
      console.log(`    ${v.reason.slice(0, 120)}`)
    }

    // Expected pattern check for BESS
    const warnRuleIds = result1.verdicts.filter(v => v.verdict === 'WARN').map(v => v.rule_id)
    if (warnRuleIds.length > 0) {
      console.log(`\n[determinism-grammar] WARN rules: ${warnRuleIds.join(', ')}`)
    }

    console.log('\n[determinism-grammar] ══ DETERMINISM TEST: PASS ══')
    process.exit(0)
  } else {
    console.error(`[determinism-grammar] ✗ FAIL — ${diffs.length} diffs detected:`)
    for (const d of diffs) {
      console.error(`  [${d.rule_id}] ${d.field}: Run1="${d.run1}" Run2="${d.run2}"`)
    }
    console.error('\n[determinism-grammar] ══ DETERMINISM TEST: FAIL ══')
    process.exit(1)
  }
}

main().catch(err => {
  console.error('[determinism-grammar] Fatal:', err)
  process.exit(1)
})
