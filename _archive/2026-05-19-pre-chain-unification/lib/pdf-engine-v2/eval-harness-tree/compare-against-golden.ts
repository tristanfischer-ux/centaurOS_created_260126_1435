/**
 * @file eval-harness/compare-against-golden.ts
 *
 * Golden eval harness comparator — Phase 0 of the Radical v1 migration.
 *
 * Diffs a fresh pipeline output for a product against the frozen golden snapshot.
 * Reports: lines added/removed/changed, total cost delta, status changes.
 * Exits non-zero if any change exceeds the configured tolerance thresholds.
 *
 * Usage:
 *   npx ts-node eval-harness/compare-against-golden.ts <product_slug> <pipeline-output.json>
 *
 * Example:
 *   npx ts-node eval-harness/compare-against-golden.ts bess-container /tmp/bess-output.json
 */

import { readFileSync } from 'fs'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GoldenBomPart {
  line_id: number
  name: string
  qty_note: string
  unit_cost_gbp: number | null
  make_buy: string
  archetype_id: string
  verification_grade: string
}

export interface GoldenTolerances {
  bom_line_count_delta_max: number
  total_cost_pct_tolerance: number
  status_change_tolerance: number
}

export interface GoldenSnapshot {
  schema: string
  captured_at: string
  product_slug: string
  product_description: string
  data_source: string
  bom_line_count: number
  known_parts_total_gbp: number
  has_real_cost_rollup: boolean
  library_growth: {
    new_radicals: number
    new_characters: number
    new_archetypes: number
  }
  tolerances: GoldenTolerances
  parts: GoldenBomPart[]
  real_cost_rollup?: {
    system_total_gbp: number
    word_subtotal_gbp: number
    verified_count: number
    estimated_count: number
    grade_d_count: number
    stub_count: number
    top_cost_drivers: Array<{ name: string; total_gbp: number; pct_of_system: number }>
  }
}

export interface PipelineBomPart {
  line_id?: number
  name: string
  qty_note?: string
  unit_cost_gbp?: number | null
  unit_price_gbp?: number | null
  make_buy?: string
  archetype_id?: string
  verification_grade?: string
}

export interface PipelineOutput {
  product_slug?: string
  bom_line_count?: number
  parts?: PipelineBomPart[]
  archetypes?: PipelineBomPart[]
  cost_rollup?: {
    total_gbp?: number
    system_total_gbp?: number
  }
  sentence?: {
    total_gbp?: number
  }
}

// ---------------------------------------------------------------------------
// Comparison result types
// ---------------------------------------------------------------------------

export interface LineDiff {
  type: 'added' | 'removed' | 'changed'
  line_id: number
  name: string
  detail: string
}

export interface CompareResult {
  product_slug: string
  golden_captured_at: string
  passed: boolean
  line_count_delta: number
  total_cost_delta_gbp: number | null
  total_cost_delta_pct: number | null
  status_changes: number
  line_diffs: LineDiff[]
  violations: string[]
  summary: string
}

// ---------------------------------------------------------------------------
// Load golden snapshot
// ---------------------------------------------------------------------------

export function loadGoldenSnapshot(productSlug: string, harnessDir?: string): GoldenSnapshot {
  const baseDir = harnessDir ?? join(__dirname, 'golden')
  const snapshotPath = join(baseDir, productSlug, 'baseline-bom.json')
  const raw = readFileSync(snapshotPath, 'utf-8')
  return JSON.parse(raw) as GoldenSnapshot
}

// ---------------------------------------------------------------------------
// Core comparison function
// ---------------------------------------------------------------------------

export function compareAgainstGolden(
  golden: GoldenSnapshot,
  pipelineOutput: PipelineOutput
): CompareResult {
  const tolerances = golden.tolerances
  const violations: string[] = []
  const lineDiffs: LineDiff[] = []

  // ── Line count delta ───────────────────────────────────────────────────────
  const freshParts: PipelineBomPart[] = pipelineOutput.parts
    ?? pipelineOutput.archetypes
    ?? []

  const freshLineCount = pipelineOutput.bom_line_count ?? freshParts.length
  const lineCountDelta = freshLineCount - golden.bom_line_count

  if (Math.abs(lineCountDelta) > tolerances.bom_line_count_delta_max) {
    violations.push(
      `BOM line count changed by ${lineCountDelta} (golden: ${golden.bom_line_count}, fresh: ${freshLineCount}). ` +
      `Max allowed delta: ${tolerances.bom_line_count_delta_max}`
    )
  }

  // ── Per-line diffs (by name matching) ─────────────────────────────────────
  const goldenByName = new Map<string, GoldenBomPart>()
  for (const p of golden.parts) goldenByName.set(p.name, p)

  const freshByName = new Map<string, PipelineBomPart>()
  for (const p of freshParts) freshByName.set(p.name, p)

  // Lines in golden but not in fresh (removed)
  for (const [name, goldenPart] of goldenByName) {
    if (!freshByName.has(name)) {
      lineDiffs.push({
        type: 'removed',
        line_id: goldenPart.line_id,
        name,
        detail: `Removed from pipeline output`,
      })
    }
  }

  // Lines in fresh but not in golden (added)
  for (const [name, freshPart] of freshByName) {
    if (!goldenByName.has(name)) {
      lineDiffs.push({
        type: 'added',
        line_id: freshPart.line_id ?? -1,
        name,
        detail: `Added to pipeline output (not in golden)`,
      })
    }
  }

  // Lines in both — check for changes
  let statusChanges = 0
  for (const [name, goldenPart] of goldenByName) {
    const freshPart = freshByName.get(name)
    if (!freshPart) continue

    const freshGrade = freshPart.verification_grade
    const goldenGrade = goldenPart.verification_grade
    if (freshGrade && goldenGrade && freshGrade !== goldenGrade) {
      statusChanges++
      lineDiffs.push({
        type: 'changed',
        line_id: goldenPart.line_id,
        name,
        detail: `verification_grade: ${goldenGrade} → ${freshGrade}`,
      })
    }

    const freshCost = freshPart.unit_cost_gbp ?? freshPart.unit_price_gbp
    const goldenCost = goldenPart.unit_cost_gbp
    if (goldenCost !== null && freshCost !== undefined && freshCost !== null) {
      const costDelta = Math.abs((freshCost - goldenCost) / goldenCost) * 100
      if (costDelta > tolerances.total_cost_pct_tolerance) {
        lineDiffs.push({
          type: 'changed',
          line_id: goldenPart.line_id,
          name,
          detail: `unit_cost_gbp: £${goldenCost} → £${freshCost} (${costDelta.toFixed(1)}% delta, tolerance ${tolerances.total_cost_pct_tolerance}%)`,
        })
      }
    }
  }

  if (statusChanges > tolerances.status_change_tolerance) {
    violations.push(
      `${statusChanges} verification_grade status changes (tolerance: ${tolerances.status_change_tolerance})`
    )
  }

  // ── Total cost delta ──────────────────────────────────────────────────────
  let totalCostDeltaGbp: number | null = null
  let totalCostDeltaPct: number | null = null

  if (golden.has_real_cost_rollup && golden.real_cost_rollup) {
    const goldenTotal = golden.real_cost_rollup.system_total_gbp
    const freshTotal = pipelineOutput.cost_rollup?.total_gbp
      ?? pipelineOutput.cost_rollup?.system_total_gbp
      ?? pipelineOutput.sentence?.total_gbp
      ?? null

    if (freshTotal !== null && freshTotal !== undefined) {
      totalCostDeltaGbp = freshTotal - goldenTotal
      totalCostDeltaPct = (totalCostDeltaGbp / goldenTotal) * 100

      if (Math.abs(totalCostDeltaPct) > tolerances.total_cost_pct_tolerance) {
        violations.push(
          `System total cost changed by ${totalCostDeltaPct.toFixed(2)}% ` +
          `(golden: £${goldenTotal.toLocaleString('en-GB', { maximumFractionDigits: 0 })}, ` +
          `fresh: £${freshTotal.toLocaleString('en-GB', { maximumFractionDigits: 0 })}). ` +
          `Tolerance: ±${tolerances.total_cost_pct_tolerance}%`
        )
      }
    }
  }

  // ── Overall verdict ────────────────────────────────────────────────────────
  const passed = violations.length === 0

  const summary = [
    `Golden eval: ${golden.product_slug} — ${passed ? 'PASS' : 'FAIL'}`,
    `  Line count: golden=${golden.bom_line_count}, fresh=${freshLineCount} (delta=${lineCountDelta > 0 ? '+' : ''}${lineCountDelta})`,
    ...(totalCostDeltaPct !== null
      ? [`  Cost delta: ${totalCostDeltaPct >= 0 ? '+' : ''}${totalCostDeltaPct.toFixed(2)}% (£${totalCostDeltaGbp?.toFixed(0)})`]
      : ['  Cost delta: N/A (no real cost rollup for this product)']),
    `  Status changes: ${statusChanges}`,
    `  Line diffs: ${lineDiffs.length} (${lineDiffs.filter(d => d.type === 'removed').length} removed, ${lineDiffs.filter(d => d.type === 'added').length} added, ${lineDiffs.filter(d => d.type === 'changed').length} changed)`,
    ...(violations.length > 0
      ? ['  VIOLATIONS:', ...violations.map(v => `    - ${v}`)]
      : ['  No violations.']),
  ].join('\n')

  return {
    product_slug: golden.product_slug,
    golden_captured_at: golden.captured_at,
    passed,
    line_count_delta: lineCountDelta,
    total_cost_delta_gbp: totalCostDeltaGbp,
    total_cost_delta_pct: totalCostDeltaPct,
    status_changes: statusChanges,
    line_diffs: lineDiffs,
    violations,
    summary,
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2)
  if (args.length < 2) {
    console.error('Usage: ts-node compare-against-golden.ts <product_slug> <pipeline-output.json>')
    console.error('Example: ts-node compare-against-golden.ts bess-container /tmp/bess-output.json')
    process.exit(1)
  }

  const [productSlug, outputPath] = args

  // Load golden snapshot
  let golden: GoldenSnapshot
  try {
    golden = loadGoldenSnapshot(productSlug)
  } catch (err) {
    console.error(`Failed to load golden snapshot for "${productSlug}": ${(err as Error).message}`)
    process.exit(1)
  }

  // Load pipeline output
  let pipelineOutput: PipelineOutput
  try {
    const raw = readFileSync(outputPath, 'utf-8')
    pipelineOutput = JSON.parse(raw) as PipelineOutput
  } catch (err) {
    console.error(`Failed to load pipeline output from "${outputPath}": ${(err as Error).message}`)
    process.exit(1)
  }

  // Run comparison
  const result = compareAgainstGolden(golden, pipelineOutput)

  console.log('\n' + result.summary)

  if (result.line_diffs.length > 0) {
    console.log('\nLine diffs:')
    for (const diff of result.line_diffs) {
      const icon = diff.type === 'added' ? '+' : diff.type === 'removed' ? '-' : '~'
      console.log(`  ${icon} [${diff.line_id}] ${diff.name}: ${diff.detail}`)
    }
  }

  // Exit non-zero on violations
  if (!result.passed) {
    console.error('\nEval FAILED — see violations above.')
    process.exit(1)
  }

  console.log('\nEval PASSED.')
}

// Only run main when executed directly (not when imported)
if (require.main === module) {
  main()
}
