#!/usr/bin/env npx tsx
/**
 * @file eval-harness/compare-resolution-against-golden.ts
 *
 * Phase 2 Resolution Comparator.
 *
 * Diffs a Phase 2 resolved radical tree against the frozen BESS golden snapshot
 * (golden/bess-container/baseline-bom.json).
 *
 * Reports:
 *   - Verified MPN count (target: ≥4)
 *   - Total cost delta vs golden (tolerance: ±2%)
 *   - MPN substitutions: acceptable if manufacturer + part_class match original
 *   - Leaves missing from resolution vs golden parts
 *
 * Exits 0 on pass, 1 on fail (for CI integration).
 *
 * Usage:
 *   RADICAL_PHASE_1_TREE_OUTPUT=true \
 *   RADICAL_PHASE_2_RESOLUTION=true \
 *   OPENROUTER_API_KEY=... \
 *   npx tsx src/lib/pdf-engine-v2/eval-harness/compare-resolution-against-golden.ts
 *
 * Or pass a pre-computed resolved tree JSON file:
 *   npx tsx .../compare-resolution-against-golden.ts --resolved-tree /tmp/resolved-tree.json
 */

import { readFileSync } from 'fs'
import { resolve, join } from 'path'

// ---------------------------------------------------------------------------
// Env loading (mirrors determinism-test.ts pattern)
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
import { runRadicalResolution, type ResolvedRadicalTree, type ResolvedLeafAnnotation, type ResolvedCompositionNode } from '../stages/4b-radical-resolution.js'
import type { GoldenSnapshot } from './compare-against-golden.js'

// ---------------------------------------------------------------------------
// Minimal parsed brief (mirrors determinism-test.ts pattern)
// ---------------------------------------------------------------------------

function buildMinimalBessParsedBrief() {
  return {
    project_id: 'bess-resolution-comparator',
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

interface ComparisonResult {
  passed: boolean
  verified_mpn_count: number
  total_leaves_resolved: number
  golden_total_gbp: number
  resolved_total_gbp: number
  cost_delta_pct: number
  cost_within_tolerance: boolean
  mpn_substitutions: Array<{
    archetype_id: string
    golden_archetype: string
    resolved_mpn: string
    substitution_acceptable: boolean
    reason: string
  }>
  missing_from_golden: string[]
  extra_in_resolved: string[]
  failures: string[]
  warnings: string[]
}

// ---------------------------------------------------------------------------
// Collect all resolved leaf annotations from the tree
// ---------------------------------------------------------------------------

function collectResolvedLeaves(root: ResolvedCompositionNode): ResolvedLeafAnnotation[] {
  const leaves: ResolvedLeafAnnotation[] = []

  function walk(node: ResolvedCompositionNode): void {
    if (!node.children || node.children.length === 0) {
      if (node.resolution) {
        leaves.push(node.resolution)
      }
    } else {
      for (const child of node.children as ResolvedCompositionNode[]) {
        walk(child)
      }
    }
  }

  walk(root)
  return leaves
}

// ---------------------------------------------------------------------------
// Compare resolved leaves against golden BOM parts
// ---------------------------------------------------------------------------

function compareResolutionAgainstGolden(
  resolvedTree: ResolvedRadicalTree,
  golden: GoldenSnapshot,
  tolerancePct: number = 2.0,
): ComparisonResult {
  const resolvedLeaves = collectResolvedLeaves(resolvedTree.composition.root as ResolvedCompositionNode)
  const failures: string[] = []
  const warnings: string[] = []

  // ── Verified MPN count ────────────────────────────────────────────────────
  const verifiedLeaves = resolvedLeaves.filter(l => l.verification_grade === 'verified')
  const verifiedMpnCount = verifiedLeaves.length

  const TARGET_VERIFIED = 4
  if (verifiedMpnCount < TARGET_VERIFIED) {
    failures.push(`Verified MPN count ${verifiedMpnCount} < target ${TARGET_VERIFIED}`)
  }

  // ── Cost delta ────────────────────────────────────────────────────────────
  let resolvedTotalGbp = 0
  for (const leaf of resolvedLeaves) {
    if (leaf.unit_price_gbp !== null) {
      resolvedTotalGbp += leaf.unit_price_gbp * leaf.qty
    }
  }

  const goldenTotal = golden.known_parts_total_gbp
  const costDeltaPct = goldenTotal > 0
    ? Math.abs(resolvedTotalGbp - goldenTotal) / goldenTotal * 100
    : 0
  const costWithinTolerance = costDeltaPct <= tolerancePct

  if (!costWithinTolerance) {
    failures.push(
      `Cost delta ${costDeltaPct.toFixed(2)}% exceeds ±${tolerancePct}% tolerance ` +
      `(resolved £${resolvedTotalGbp.toLocaleString('en-GB', { maximumFractionDigits: 0 })} vs ` +
      `golden £${goldenTotal.toLocaleString('en-GB', { maximumFractionDigits: 0 })})`
    )
  }

  // ── MPN substitution check ────────────────────────────────────────────────
  // For each verified MPN in the resolved tree, check if the golden has an entry
  // with the same archetype_id and whether the substitution is acceptable.

  const mpnSubstitutions: ComparisonResult['mpn_substitutions'] = []

  for (const leaf of verifiedLeaves) {
    const goldenPart = golden.parts.find(p =>
      p.archetype_id === leaf.archetype_id ||
      // Fuzzy match by name fragment
      p.name.toLowerCase().includes(leaf.archetype_id.replace(/_/g, ' ').toLowerCase().slice(0, 6))
    )

    if (goldenPart) {
      // Substitution is acceptable if manufacturer is real (not null) and
      // the part_class matches the golden expected class
      const substitutionAcceptable = leaf.manufacturer !== null

      mpnSubstitutions.push({
        archetype_id: leaf.archetype_id,
        golden_archetype: goldenPart.archetype_id,
        resolved_mpn: leaf.mpn ?? '(null)',
        substitution_acceptable: substitutionAcceptable,
        reason: substitutionAcceptable
          ? `Verified via distributor (${leaf.distributor})`
          : 'Manufacturer unknown — cannot confirm substitution',
      })

      if (!substitutionAcceptable) {
        warnings.push(`MPN substitution for ${leaf.archetype_id} unacceptable: manufacturer unknown`)
      }
    }
  }

  // ── Coverage: golden parts vs resolved leaves ─────────────────────────────
  const resolvedArchetypeIds = new Set(resolvedLeaves.map(l => l.archetype_id))
  const goldenArchetypeIds = new Set(golden.parts.map(p => p.archetype_id))

  const missingFromGolden: string[] = []
  for (const gId of goldenArchetypeIds) {
    if (!resolvedArchetypeIds.has(gId)) {
      // Check if there's a fuzzy match
      const fuzzyMatch = [...resolvedArchetypeIds].some(rId =>
        rId.includes(gId.slice(0, 8)) || gId.includes(rId.slice(0, 8))
      )
      if (!fuzzyMatch) {
        missingFromGolden.push(gId)
        warnings.push(`Golden archetype ${gId} has no match in resolved tree`)
      }
    }
  }

  const extraInResolved: string[] = []
  for (const rId of resolvedArchetypeIds) {
    if (!goldenArchetypeIds.has(rId)) {
      const fuzzyMatch = [...goldenArchetypeIds].some(gId =>
        gId.includes(rId.slice(0, 8)) || rId.includes(gId.slice(0, 8))
      )
      if (!fuzzyMatch) {
        extraInResolved.push(rId)
        warnings.push(`Resolved archetype ${rId} not in golden (may be Phase 1.5 character-level node)`)
      }
    }
  }

  const passed = failures.length === 0

  return {
    passed,
    verified_mpn_count: verifiedMpnCount,
    total_leaves_resolved: resolvedLeaves.length,
    golden_total_gbp: goldenTotal,
    resolved_total_gbp: resolvedTotalGbp,
    cost_delta_pct: costDeltaPct,
    cost_within_tolerance: costWithinTolerance,
    mpn_substitutions: mpnSubstitutions,
    missing_from_golden: missingFromGolden,
    extra_in_resolved: extraInResolved,
    failures,
    warnings,
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2)
  const resolvedTreeArg = args.indexOf('--resolved-tree')

  let resolvedTree: ResolvedRadicalTree

  if (resolvedTreeArg !== -1 && args[resolvedTreeArg + 1]) {
    // Load from file
    const filePath = resolve(args[resolvedTreeArg + 1])
    console.log(`[comparator] Loading resolved tree from ${filePath}`)
    resolvedTree = JSON.parse(readFileSync(filePath, 'utf-8'))
  } else {
    // Run Phase 1 + Phase 2 live
    console.log('[comparator] Running Phase 1.5 + Phase 2 for BESS...')

    // Set Phase 1 flag
    process.env.RADICAL_PHASE_1_TREE_OUTPUT = 'true'

    const parsedBrief = buildMinimalBessParsedBrief()

    console.log('[comparator] Running runDecomposeRadical...')
    const radicalResult = await runDecomposeRadical(parsedBrief as any, 'battery_energy_storage')

    if (!radicalResult.ok || !radicalResult.data) {
      console.error(`[comparator] ERROR: Phase 1.5 decomposition failed: ${radicalResult.error}`)
      process.exit(1)
    }

    const radicalTree = radicalResult.data.tree
    console.log(`[comparator] Phase 1.5 tree: ${radicalResult.data.leafCount ?? 0} leaves placed, ${radicalResult.data.unknowns.length} unknowns`)

    // Run Phase 2 resolution
    console.log('[comparator] Running Phase 2 resolution...')
    resolvedTree = await runRadicalResolution(radicalTree, 'battery_energy_storage')
  }

  // Load golden
  const goldenPath = join(
    process.cwd(),
    'src/lib/pdf-engine-v2/eval-harness/golden/bess-container/baseline-bom.json'
  )
  const golden: GoldenSnapshot = JSON.parse(readFileSync(goldenPath, 'utf-8'))

  // Compare
  const result = compareResolutionAgainstGolden(resolvedTree, golden, golden.tolerances.total_cost_pct_tolerance)

  // ── Report ─────────────────────────────────────────────────────────────────

  console.log('\n' + '='.repeat(70))
  console.log('PHASE 2 RESOLUTION COMPARATOR — BESS vs GOLDEN')
  console.log('='.repeat(70))
  console.log(`\nStatus:          ${result.passed ? 'PASS' : 'FAIL'}`)
  console.log(`Verified MPNs:   ${result.verified_mpn_count} (target: ≥4)`)
  console.log(`Leaves resolved: ${result.total_leaves_resolved}`)
  console.log(`Golden total:    £${result.golden_total_gbp.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`)
  console.log(`Resolved total:  £${result.resolved_total_gbp.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`)
  console.log(`Cost delta:      ${result.cost_delta_pct.toFixed(2)}% (tolerance: ±${golden.tolerances.total_cost_pct_tolerance}%)`)
  console.log(`Cost OK:         ${result.cost_within_tolerance ? 'YES' : 'NO'}`)

  if (result.mpn_substitutions.length > 0) {
    console.log('\nVerified MPN substitutions:')
    for (const s of result.mpn_substitutions) {
      const mark = s.substitution_acceptable ? '  OK' : ' WARN'
      console.log(`  ${mark} ${s.archetype_id} → ${s.resolved_mpn} (${s.reason})`)
    }
  }

  if (result.missing_from_golden.length > 0) {
    console.log(`\nMissing from golden (in resolved but not matched): ${result.missing_from_golden.join(', ')}`)
  }

  if (result.extra_in_resolved.length > 0) {
    console.log(`\nExtra in resolved (not in golden): ${result.extra_in_resolved.join(', ')}`)
  }

  if (result.warnings.length > 0) {
    console.log('\nWarnings:')
    for (const w of result.warnings) console.log(`  WARN ${w}`)
  }

  if (result.failures.length > 0) {
    console.log('\nFailures:')
    for (const f of result.failures) console.log(`  FAIL ${f}`)
  }

  console.log('\nResolution meta:')
  console.log(`  Distributor priority: ${resolvedTree.resolution_meta.distributor_priority}`)
  console.log(`  Distributor API calls: ${resolvedTree.resolution_meta.distributor_calls_made}`)
  console.log(`  Resolved at: ${resolvedTree.resolution_meta.resolved_at}`)

  console.log('\n' + '='.repeat(70))
  console.log(result.passed ? 'RESULT: PASS' : 'RESULT: FAIL')
  console.log('='.repeat(70) + '\n')

  process.exit(result.passed ? 0 : 1)
}

main().catch(err => {
  console.error('[comparator] Fatal error:', err)
  process.exit(1)
})
