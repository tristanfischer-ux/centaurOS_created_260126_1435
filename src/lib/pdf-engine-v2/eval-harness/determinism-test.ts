#!/usr/bin/env npx tsx
/**
 * @file eval-harness/determinism-test.ts
 *
 * Radical Phase 1 — Determinism test.
 *
 * Runs the BESS brief through Module Decomposition (Radical tree path) TWICE
 * with RADICAL_PHASE_1_TREE_OUTPUT=true and diffs the two trees structurally.
 *
 * Fails loudly (exit 1) if the trees differ in:
 *   - Shape (node count, depth)
 *   - archetypeId at any node
 *   - multiplicity/quantity at any node
 *
 * Tolerance: ZERO. Same input MUST produce same tree (temperature=0 enforced
 * by runDecomposeRadical — see 2-decompose.ts).
 *
 * This test is the Opus-risk mitigation from the migration plan council (e989f6f2):
 * "decomposition non-determinism — same input produces different tree shapes;
 *  cost rollup non-reproducible; trust-destroying production bug only
 *  discoverable after Phases 1-3 are deployed."
 *
 * Usage:
 *   RADICAL_PHASE_1_TREE_OUTPUT=true \
 *   OPENROUTER_API_KEY=... \
 *   npx tsx src/lib/pdf-engine-v2/eval-harness/determinism-test.ts
 *
 * CI: Add to pre-commit / pre-push as:
 *   RADICAL_PHASE_1_TREE_OUTPUT=true npx tsx .../determinism-test.ts
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load .env.local if present
try {
  const envPath = resolve(process.cwd(), '.env.local')
  const envContent = readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...valueParts] = trimmed.split('=')
      const value = valueParts.join('=').replace(/^["']|["']$/g, '')
      if (!process.env[key]) {
        process.env[key] = value
      }
    }
  }
} catch { /* no .env.local — continue */ }

// Load distributor secrets if available
try {
  const secretsPath = resolve(process.env.HOME ?? '', '.claude/secrets/distributor-apis.env')
  const envContent = readFileSync(secretsPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...valueParts] = trimmed.split('=')
      const value = valueParts.join('=').replace(/^["']|["']$/g, '')
      if (!process.env[key]) {
        process.env[key] = value
      }
    }
  }
} catch { /* secrets not present — continue */ }

import { runDecomposeRadical } from '../stages/2-decompose.js'
import type { CompositionNode, RadicalTree } from '../radical/schema.js'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NodeDiff {
  path: string
  field: string
  run1: unknown
  run2: unknown
}

// ---------------------------------------------------------------------------
// Structural tree diff
// ---------------------------------------------------------------------------

/**
 * Recursively diff two CompositionNode trees.
 * Compares archetypeId and quantity at every node.
 * Child order matters — nodes must appear in the same order.
 */
function diffNodes(
  node1: CompositionNode,
  node2: CompositionNode,
  path: string,
  diffs: NodeDiff[],
): void {
  if (node1.archetypeId !== node2.archetypeId) {
    diffs.push({ path, field: 'archetypeId', run1: node1.archetypeId, run2: node2.archetypeId })
  }

  const qty1 = node1.quantity
  const qty2 = node2.quantity
  if (qty1 !== qty2) {
    diffs.push({ path, field: 'quantity', run1: qty1, run2: qty2 })
  }

  const children1 = node1.children ?? []
  const children2 = node2.children ?? []

  if (children1.length !== children2.length) {
    diffs.push({
      path,
      field: 'children.length',
      run1: children1.length,
      run2: children2.length,
    })
    // Still recurse into shared length to catch deeper diffs
    const sharedLen = Math.min(children1.length, children2.length)
    for (let i = 0; i < sharedLen; i++) {
      diffNodes(children1[i], children2[i], `${path}.children[${i}]`, diffs)
    }
    return
  }

  for (let i = 0; i < children1.length; i++) {
    diffNodes(children1[i], children2[i], `${path}.children[${i}]`, diffs)
  }
}

function diffTrees(tree1: RadicalTree, tree2: RadicalTree): NodeDiff[] {
  const diffs: NodeDiff[] = []
  diffNodes(tree1.composition.root, tree2.composition.root, 'root', diffs)
  return diffs
}

// ---------------------------------------------------------------------------
// Count nodes in tree
// ---------------------------------------------------------------------------

function countNodes(node: CompositionNode): number {
  return 1 + (node.children ?? []).reduce((sum, child) => sum + countNodes(child), 0)
}

// ---------------------------------------------------------------------------
// Load BESS brief
// ---------------------------------------------------------------------------

function loadBessBrief(): string {
  const briefPath = join(__dirname, '..', 'briefs', 'baseline-10', '09-bess-container.md')
  return readFileSync(briefPath, 'utf-8')
}

// ---------------------------------------------------------------------------
// Minimal parsed brief for runDecomposeRadical
// ---------------------------------------------------------------------------

function buildMinimalBessParsedBrief() {
  // Minimal StructuredBriefJSON for the determinism test.
  // Full pipeline parsing is not needed — we only need the decompose stage.
  return {
    project_id: 'bess-determinism-test',
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
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=== Radical Phase 1 — Determinism Test ===\n')

  // Guard: must be running with Phase 1 flag
  if (!process.env.RADICAL_PHASE_1_TREE_OUTPUT) {
    console.error('ERROR: RADICAL_PHASE_1_TREE_OUTPUT env var must be set.')
    console.error('Run as: RADICAL_PHASE_1_TREE_OUTPUT=true npx tsx determinism-test.ts')
    process.exit(1)
  }

  if (!process.env.OPENROUTER_API_KEY) {
    console.error('ERROR: OPENROUTER_API_KEY is not set.')
    process.exit(1)
  }

  const parsedBrief = buildMinimalBessParsedBrief()
  const classification = 'battery_energy_storage'

  console.log('Run 1: calling runDecomposeRadical...')
  const result1 = await runDecomposeRadical(parsedBrief as any, classification)
  if (!result1.ok || !result1.data) {
    console.error(`Run 1 FAILED: ${result1.error}`)
    process.exit(1)
  }
  const tree1 = result1.data.tree
  const nodeCount1 = countNodes(tree1.composition.root)
  console.log(`Run 1: OK. Nodes: ${nodeCount1}. Unknowns: ${result1.data.unknowns.length}`)

  console.log('\nRun 2: calling runDecomposeRadical (same inputs)...')
  const result2 = await runDecomposeRadical(parsedBrief as any, classification)
  if (!result2.ok || !result2.data) {
    console.error(`Run 2 FAILED: ${result2.error}`)
    process.exit(1)
  }
  const tree2 = result2.data.tree
  const nodeCount2 = countNodes(tree2.composition.root)
  console.log(`Run 2: OK. Nodes: ${nodeCount2}. Unknowns: ${result2.data.unknowns.length}`)

  // Diff the two trees
  console.log('\nDiffing trees...')
  const diffs = diffTrees(tree1, tree2)

  if (diffs.length === 0) {
    console.log('\nDeterminism test: PASS — both runs produced identical trees.')
    console.log(`  Nodes: ${nodeCount1}`)
    console.log(`  Unknowns run1: ${result1.data.unknowns.length}, run2: ${result2.data.unknowns.length}`)
    console.log('  Same input produced same tree shape, archetypeIds, and quantities.')
    process.exit(0)
  } else {
    console.error(`\nDeterminism test: FAIL — ${diffs.length} difference(s) found between runs:\n`)
    for (const diff of diffs) {
      console.error(`  DIFF at ${diff.path}.${diff.field}:`)
      console.error(`    Run 1: ${JSON.stringify(diff.run1)}`)
      console.error(`    Run 2: ${JSON.stringify(diff.run2)}`)
    }
    console.error('\nOpus-risk triggered: non-determinism in Radical Phase 1 tree output.')
    console.error('Root cause: likely model temperature > 0 or LLM-side sampling variance.')
    console.error('Fix: confirm temperature=0.0 is enforced in runDecomposeRadical().')
    process.exit(1)
  }
}

main().catch(err => {
  console.error('Determinism test threw unexpectedly:', err)
  process.exit(1)
})
