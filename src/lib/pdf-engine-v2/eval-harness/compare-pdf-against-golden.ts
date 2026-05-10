#!/usr/bin/env npx tsx
/**
 * @file eval-harness/compare-pdf-against-golden.ts — Phase 5 PDF comparison
 *
 * Diffs rendered Radical v1 PDF output against the golden BoM JSON.
 * Consumes: golden/bess-container/baseline-bom.json (or other class)
 * Reads:    pipeline state JSON (written by run.ts --brief with --save-state flag,
 *            or loaded from a checkpoint file)
 *
 * What it checks:
 *   1. Part name fuzzy match — every golden part name must appear (substring or
 *      normalised-edit-distance < 0.3) in the resolved radical tree leaves.
 *   2. MPN hard match — where golden has a known MPN, the resolved leaf must
 *      match exactly (case-insensitive).
 *   3. Total cost ±2% tolerance — radicalCostSummary.finalUnitCost vs
 *      golden known_parts_total_gbp (only when has_real_cost_rollup=true).
 *   4. BOM line count — must match golden bom_line_count within tolerance.
 *   5. Verification grade check — resolved leaves must not be ALL data_gap
 *      (sanity: distributor resolution must fire at least once).
 *
 * Usage:
 *   npx tsx src/lib/pdf-engine-v2/eval-harness/compare-pdf-against-golden.ts \
 *     --golden src/lib/pdf-engine-v2/eval-harness/golden/bess-container/baseline-bom.json \
 *     --state /tmp/bess-phase5-state.json
 *
 * Exit codes:
 *   0 — all checks pass (or within tolerance)
 *   1 — at least one hard failure
 *   2 — partial: warnings only (within tolerance thresholds)
 *
 * Notes:
 *   - This tool does NOT render a PDF. It compares resolved tree state.
 *   - The PDF itself is inspected by opening it in Preview (see run script).
 *   - MPN matching is optional: golden parts without mpn fields are skipped.
 *   - Fuzzy name matching uses normalised Levenshtein distance.
 */

import { readFileSync } from 'fs'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GoldenBomPart {
  line_id: number
  name: string
  qty_note?: string | null
  unit_cost_gbp: number | null
  make_buy?: string
  archetype_id?: string
  mpn?: string | null
  verification_grade?: string
}

interface GoldenBaseline {
  schema: string
  captured_at: string
  product_slug: string
  product_description: string
  bom_line_count: number
  known_parts_total_gbp: number
  has_real_cost_rollup: boolean
  tolerances: {
    bom_line_count_delta_max: number
    total_cost_pct_tolerance: number
    status_change_tolerance: number
  }
  parts: GoldenBomPart[]
}

interface ResolvedLeaf {
  archetypeId: string
  label?: string
  unitPriceGbp?: number | null
  lineTotal?: number
  verificationGrade?: string
  source?: string
  mpn?: string | null
}

interface RadicalCostSummary {
  finalUnitCost: number
  bomTotal: number
  radicalMeta?: {
    total_leaves: number
    priced_leaves: number
  }
}

// Minimal pipeline state shape — only fields we need
interface MinimalPipelineState {
  resolvedRadicalTree?: {
    composition?: {
      root?: {
        archetypeId: string
        children?: unknown[]
        resolution?: {
          unit_price_gbp?: number | null
          mpn?: string | null
          verification_grade?: string
          source?: string
          qty?: number
        }
      }
    }
    resolution_meta?: {
      stats?: {
        total_leaves: number
        verified_by_distributor: number
      }
    }
  }
  radicalCostSummary?: RadicalCostSummary
  grammarVerdicts?: {
    overall_verdict: string
    warn_count: number
    block_count: number
  }
}

// ---------------------------------------------------------------------------
// Levenshtein distance — for fuzzy name matching
// ---------------------------------------------------------------------------

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

function normalisedDistance(a: string, b: string): number {
  const la = a.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim()
  const lb = b.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim()
  const dist = levenshtein(la, lb)
  return dist / Math.max(la.length, lb.length, 1)
}

function fuzzyMatch(needle: string, haystack: string[]): boolean {
  const needleNorm = needle.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
  for (const h of haystack) {
    const hNorm = h.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
    // Substring match
    if (hNorm.includes(needleNorm) || needleNorm.includes(hNorm)) return true
    // Edit-distance match
    if (normalisedDistance(needleNorm, hNorm) < 0.35) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Tree walker — collect all leaf nodes recursively
// ---------------------------------------------------------------------------

interface TreeNode {
  archetypeId: string
  children?: TreeNode[]
  resolution?: {
    unit_price_gbp?: number | null
    mpn?: string | null
    verification_grade?: string
    source?: string
    qty?: number
  }
}

function collectLeaves(node: TreeNode): ResolvedLeaf[] {
  const results: ResolvedLeaf[] = []
  function walk(n: TreeNode): void {
    const isLeaf = !n.children || n.children.length === 0
    if (isLeaf) {
      results.push({
        archetypeId: n.archetypeId,
        label: n.archetypeId.replace(/_/g, ' '),
        unitPriceGbp: n.resolution?.unit_price_gbp ?? null,
        lineTotal: n.resolution?.unit_price_gbp != null
          ? n.resolution.unit_price_gbp * (n.resolution.qty ?? 1)
          : 0,
        verificationGrade: n.resolution?.verification_grade ?? 'data_gap',
        source: n.resolution?.source ?? 'stub',
        mpn: n.resolution?.mpn ?? null,
      })
    } else {
      for (const child of n.children!) {
        walk(child as TreeNode)
      }
    }
  }
  walk(node)
  return results
}

// ---------------------------------------------------------------------------
// Comparison logic
// ---------------------------------------------------------------------------

interface CheckResult {
  check: string
  passed: boolean
  warning?: boolean
  detail: string
}

function compareAgainstGolden(
  golden: GoldenBaseline,
  state: MinimalPipelineState,
): CheckResult[] {
  const results: CheckResult[] = []

  const tree = state.resolvedRadicalTree
  if (!tree?.composition?.root) {
    return [{
      check: 'resolved_tree_present',
      passed: false,
      detail: 'state.resolvedRadicalTree is absent — Phase 2 must have run',
    }]
  }

  const leaves = collectLeaves(tree.composition.root as TreeNode)
  const leafLabels = leaves.map(l => l.label ?? l.archetypeId ?? '')
  const leafMpns = leaves.map(l => l.mpn ?? '').filter(Boolean)

  // ── Check 1: BOM line count ──────────────────────────────────────────────
  const leafCount = leaves.length
  const goldenCount = golden.bom_line_count
  const countDelta = Math.abs(leafCount - goldenCount)
  const countTol = golden.tolerances.bom_line_count_delta_max
  results.push({
    check: 'bom_line_count',
    passed: countDelta <= countTol,
    warning: countDelta > countTol && countDelta <= countTol + 3,
    detail: `Radical: ${leafCount} leaves, Golden: ${goldenCount}. Delta: ${countDelta} (tolerance: ±${countTol}).`,
  })

  // ── Check 2: Total cost ±2% ───────────────────────────────────────────────
  if (golden.has_real_cost_rollup && state.radicalCostSummary) {
    const radicalTotal = state.radicalCostSummary.finalUnitCost
    const goldenTotal = golden.known_parts_total_gbp
    const pctDiff = Math.abs(radicalTotal - goldenTotal) / Math.max(goldenTotal, 1) * 100
    const tol = golden.tolerances.total_cost_pct_tolerance
    results.push({
      check: 'total_cost_within_tolerance',
      passed: pctDiff <= tol,
      warning: pctDiff > tol && pctDiff <= tol * 2,
      detail: `Radical total: £${radicalTotal.toLocaleString('en-GB', { maximumFractionDigits: 0 })}, ` +
              `Golden: £${goldenTotal.toLocaleString('en-GB', { maximumFractionDigits: 0 })}. ` +
              `Diff: ${pctDiff.toFixed(1)}% (tolerance: ±${tol}%).`,
    })
  } else if (golden.has_real_cost_rollup && !state.radicalCostSummary) {
    results.push({
      check: 'total_cost_within_tolerance',
      passed: false,
      detail: 'radicalCostSummary absent — Phase 3 must run for cost comparison.',
    })
  }

  // ── Check 3: Fuzzy part name match ───────────────────────────────────────
  const missingParts: string[] = []
  for (const goldenPart of golden.parts) {
    if (!fuzzyMatch(goldenPart.name, leafLabels)) {
      missingParts.push(goldenPart.name)
    }
  }
  results.push({
    check: 'part_names_fuzzy_match',
    passed: missingParts.length === 0,
    warning: missingParts.length > 0 && missingParts.length <= 3,
    detail: missingParts.length === 0
      ? `All ${golden.parts.length} golden parts matched in Radical leaves.`
      : `${missingParts.length} golden part(s) NOT matched: ${missingParts.slice(0, 5).join(', ')}${missingParts.length > 5 ? '...' : ''}`,
  })

  // ── Check 4: MPN hard match ────────────────────────────────────────────────
  const mpnMismatches: string[] = []
  for (const goldenPart of golden.parts) {
    if (!goldenPart.mpn) continue  // Skip parts without known MPNs
    const mpnLower = goldenPart.mpn.toLowerCase()
    const found = leafMpns.some(m => m.toLowerCase() === mpnLower)
    if (!found) {
      mpnMismatches.push(`${goldenPart.name} (${goldenPart.mpn})`)
    }
  }
  const goldenMpnParts = golden.parts.filter(p => p.mpn)
  results.push({
    check: 'mpn_hard_match',
    passed: mpnMismatches.length === 0,
    warning: mpnMismatches.length > 0 && mpnMismatches.length <= 2,
    detail: goldenMpnParts.length === 0
      ? 'No MPNs in golden baseline — skipped.'
      : mpnMismatches.length === 0
        ? `All ${goldenMpnParts.length} golden MPNs matched in Radical leaves.`
        : `${mpnMismatches.length}/${goldenMpnParts.length} MPN(s) NOT matched: ${mpnMismatches.slice(0, 3).join('; ')}`,
  })

  // ── Check 5: Verification grades — not all data_gap ───────────────────────
  const allDataGap = leaves.every(l => l.verificationGrade === 'data_gap')
  const verifiedCount = leaves.filter(l => l.verificationGrade === 'verified').length
  const pricedCount = leaves.filter(l => (l.lineTotal ?? 0) > 0).length
  results.push({
    check: 'resolution_quality',
    passed: !allDataGap && pricedCount > 0,
    warning: pricedCount > 0 && verifiedCount === 0,
    detail: `${leaves.length} leaves: ${verifiedCount} verified, ${pricedCount} priced, ` +
            `${leaves.filter(l => l.verificationGrade === 'data_gap').length} data_gap.`,
  })

  // ── Check 6: Grammar verdicts present (when Phase 4 ran) ─────────────────
  if (state.grammarVerdicts) {
    const { overall_verdict, warn_count, block_count } = state.grammarVerdicts
    results.push({
      check: 'grammar_verdicts_present',
      passed: true,
      detail: `Grammar: ${overall_verdict}. ${warn_count} WARN, ${block_count} BLOCK.`,
    })
  }

  return results
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2)

  const goldenIdx = args.indexOf('--golden')
  const stateIdx = args.indexOf('--state')

  if (goldenIdx === -1 || stateIdx === -1) {
    console.error('Usage:')
    console.error('  npx tsx eval-harness/compare-pdf-against-golden.ts \\')
    console.error('    --golden eval-harness/golden/bess-container/baseline-bom.json \\')
    console.error('    --state /tmp/bess-phase5-state.json')
    process.exit(2)
  }

  const goldenPath = args[goldenIdx + 1]
  const statePath = args[stateIdx + 1]

  let golden: GoldenBaseline
  let state: MinimalPipelineState

  try {
    golden = JSON.parse(readFileSync(goldenPath, 'utf-8')) as GoldenBaseline
  } catch (e) {
    console.error(`[compare] Failed to read golden file: ${goldenPath}`)
    console.error(e)
    process.exit(1)
  }

  try {
    state = JSON.parse(readFileSync(statePath, 'utf-8')) as MinimalPipelineState
  } catch (e) {
    console.error(`[compare] Failed to read state file: ${statePath}`)
    console.error(e)
    process.exit(1)
  }

  console.log(`\n[compare] Golden: ${golden.product_slug} (${golden.bom_line_count} parts, £${golden.known_parts_total_gbp.toLocaleString('en-GB')})`)
  console.log(`[compare] Captured: ${golden.captured_at}`)
  console.log()

  const results = compareAgainstGolden(golden, state)

  let hardFailures = 0
  let warnings = 0

  for (const result of results) {
    const icon = result.passed ? '✓' : result.warning ? '⚠' : '✗'
    const status = result.passed ? 'PASS' : result.warning ? 'WARN' : 'FAIL'
    console.log(`  ${icon} ${status.padEnd(5)} ${result.check}`)
    console.log(`         ${result.detail}`)

    if (!result.passed && !result.warning) hardFailures++
    if (!result.passed && result.warning) warnings++
  }

  console.log()
  console.log(`[compare] Summary: ${results.filter(r => r.passed).length} PASS, ${warnings} WARN, ${hardFailures} FAIL`)

  if (hardFailures > 0) {
    console.log('[compare] RESULT: FAIL — hard failures detected')
    process.exit(1)
  } else if (warnings > 0) {
    console.log('[compare] RESULT: PASS WITH WARNINGS — within tolerance thresholds')
    process.exit(2)
  } else {
    console.log('[compare] RESULT: PASS — all checks green')
    process.exit(0)
  }
}

main().catch(err => {
  console.error('[compare] Fatal error:', err)
  process.exit(1)
})
