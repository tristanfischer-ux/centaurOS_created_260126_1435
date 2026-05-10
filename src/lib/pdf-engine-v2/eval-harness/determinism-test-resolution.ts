#!/usr/bin/env npx tsx
/**
 * @file eval-harness/determinism-test-resolution.ts
 *
 * Phase 2 — Resolution Stage Determinism Test.
 *
 * Runs Phase 1.5 + Phase 2 TWICE on the BESS brief and diffs the two
 * ResolvedRadicalTrees structurally. Exits 1 on any difference.
 *
 * The resolution stage is ENTIRELY deterministic for a given input:
 *   - Distributor API calls return the same MPN/price for the same MPN query
 *   - Vendor-catalog lookups are deterministic (in-memory table)
 *   - Grade D fallbacks are deterministic (in-memory table)
 *   - Software IP uses the LLM-provided price from the tree leaf (from Phase 1.5)
 *
 * Phase 1.5 tree shape is also deterministic (structural-builder.ts uses
 * physics overrides + mandatory character list — same brief → same tree).
 *
 * Therefore: Phase 1.5 + Phase 2 together must produce ZERO diffs.
 *
 * Failure modes caught by this test:
 *   - Non-deterministic archetype classification (classifyLeafPartClass changes)
 *   - Non-deterministic vendor-catalog lookup ordering
 *   - Accidental LLM call introduced into resolution path
 *   - Race condition in distributor API Promise.all ordering
 *
 * Usage:
 *   RADICAL_PHASE_1_TREE_OUTPUT=true \
 *   RADICAL_PHASE_2_RESOLUTION=true \
 *   OPENROUTER_API_KEY=... \
 *   npx tsx src/lib/pdf-engine-v2/eval-harness/determinism-test-resolution.ts
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

// ---------------------------------------------------------------------------
// Env loading
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

// ---------------------------------------------------------------------------
// Minimal parsed brief (mirrors determinism-test.ts pattern)
// ---------------------------------------------------------------------------

function buildMinimalBessParsedBrief() {
  return {
    project_id: 'bess-resolution-determinism-test',
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

interface LeafDiff {
  path: string
  field: string
  run1: unknown
  run2: unknown
}

// ---------------------------------------------------------------------------
// Leaf collector
// ---------------------------------------------------------------------------

interface LeafEntry {
  path: string
  archetypeId: string
  qty: number
  resolution: ResolvedLeafAnnotation | undefined
}

function collectLeafEntries(
  node: ResolvedCompositionNode,
  path: string = 'root',
): LeafEntry[] {
  const entries: LeafEntry[] = []

  if (!node.children || node.children.length === 0) {
    entries.push({
      path,
      archetypeId: node.archetypeId,
      qty: node.quantity,
      resolution: node.resolution,
    })
  } else {
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i] as ResolvedCompositionNode
      entries.push(...collectLeafEntries(child, `${path}.children[${i}](${child.archetypeId})`))
    }
  }

  return entries
}

// ---------------------------------------------------------------------------
// Resolution diff
// ---------------------------------------------------------------------------

function diffResolvedTrees(
  tree1: ResolvedRadicalTree,
  tree2: ResolvedRadicalTree,
): LeafDiff[] {
  const diffs: LeafDiff[] = []

  const leaves1 = collectLeafEntries(tree1.composition.root as ResolvedCompositionNode)
  const leaves2 = collectLeafEntries(tree2.composition.root as ResolvedCompositionNode)

  // ── Structural check ──────────────────────────────────────────────────────
  if (leaves1.length !== leaves2.length) {
    diffs.push({
      path: 'root',
      field: 'leaf_count',
      run1: leaves1.length,
      run2: leaves2.length,
    })
    // Cannot compare leaf-by-leaf if counts differ
    return diffs
  }

  // ── Leaf-by-leaf check ────────────────────────────────────────────────────
  for (let i = 0; i < leaves1.length; i++) {
    const l1 = leaves1[i]
    const l2 = leaves2[i]
    const path = `leaf[${i}](${l1.archetypeId})`

    // archetypeId
    if (l1.archetypeId !== l2.archetypeId) {
      diffs.push({ path, field: 'archetypeId', run1: l1.archetypeId, run2: l2.archetypeId })
    }

    // qty
    if (l1.qty !== l2.qty) {
      diffs.push({ path, field: 'qty', run1: l1.qty, run2: l2.qty })
    }

    // resolution fields
    const r1 = l1.resolution
    const r2 = l2.resolution

    if (!r1 && !r2) continue

    if (!r1 || !r2) {
      diffs.push({
        path,
        field: 'resolution_present',
        run1: r1 !== undefined,
        run2: r2 !== undefined,
      })
      continue
    }

    const fields: (keyof ResolvedLeafAnnotation)[] = [
      'part_class',
      'mpn',
      'manufacturer',
      'unit_price_gbp',
      'lead_weeks',
      'verification_grade',
      'source',
      'distributor',
    ]

    for (const field of fields) {
      if (r1[field] !== r2[field]) {
        diffs.push({ path, field, run1: r1[field], run2: r2[field] })
      }
    }
  }

  return diffs
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  process.env.RADICAL_PHASE_1_TREE_OUTPUT = 'true'

  const parsedBrief = buildMinimalBessParsedBrief()

  console.log('[det-test-resolution] Run 1: Phase 1.5 decomposition...')
  const result1 = await runDecomposeRadical(parsedBrief as any, 'battery_energy_storage')
  if (!result1.ok || !result1.data) {
    console.error(`[det-test-resolution] Run 1 Phase 1.5 failed: ${result1.error}`)
    process.exit(1)
  }

  console.log('[det-test-resolution] Run 1: Phase 2 resolution...')
  const resolved1 = await runRadicalResolution(result1.data.tree, 'battery_energy_storage')

  console.log('[det-test-resolution] Run 2: Phase 1.5 decomposition...')
  const result2 = await runDecomposeRadical(parsedBrief as any, 'battery_energy_storage')
  if (!result2.ok || !result2.data) {
    console.error(`[det-test-resolution] Run 2 Phase 1.5 failed: ${result2.error}`)
    process.exit(1)
  }

  console.log('[det-test-resolution] Run 2: Phase 2 resolution...')
  const resolved2 = await runRadicalResolution(result2.data.tree, 'battery_energy_storage')

  // ── Diff ──────────────────────────────────────────────────────────────────

  const diffs = diffResolvedTrees(resolved1, resolved2)

  console.log('\n' + '='.repeat(70))
  console.log('PHASE 2 RESOLUTION DETERMINISM TEST — BESS (two runs)')
  console.log('='.repeat(70))
  console.log(`\nRun 1: ${resolved1.resolution_meta.stats.total_leaves} leaves, ` +
    `${resolved1.resolution_meta.stats.verified_by_distributor} verified, ` +
    `${resolved1.resolution_meta.distributor_calls_made} API calls`)
  console.log(`Run 2: ${resolved2.resolution_meta.stats.total_leaves} leaves, ` +
    `${resolved2.resolution_meta.stats.verified_by_distributor} verified, ` +
    `${resolved2.resolution_meta.distributor_calls_made} API calls`)

  if (diffs.length === 0) {
    console.log('\nResult: PASS — 0 diffs (fully deterministic)')
    console.log('='.repeat(70) + '\n')
    process.exit(0)
  } else {
    console.log(`\nResult: FAIL — ${diffs.length} diffs found`)
    console.log('\nDiffs:')
    for (const d of diffs) {
      console.log(`  ${d.path}.${d.field}: run1=${JSON.stringify(d.run1)} vs run2=${JSON.stringify(d.run2)}`)
    }
    console.log('='.repeat(70) + '\n')
    process.exit(1)
  }
}

main().catch(err => {
  console.error('[det-test-resolution] Fatal error:', err)
  process.exit(1)
})
