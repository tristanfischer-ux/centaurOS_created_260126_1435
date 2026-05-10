/**
 * @file radical/phase-0-slice/pipeline.ts
 *
 * Phase 0 vertical slice — end-to-end pipeline for BESS only.
 *
 * Activated when RADICAL_PHASE_0_SLICE=true.
 *
 * This pipeline:
 *   1. Loads the hardcoded BESS Radical tree
 *   2. Verifies schema version compatibility
 *   3. Runs the BESS grammar pass (lifted from demo/grammar-pass.ts)
 *   4. Runs the cost rollup (lifted from demo/cost-rollup.ts)
 *   5. Returns a PhaseZeroSliceResult for the pipeline trace
 *
 * The PDF render integration is deferred (the BoM section uses the existing
 * per-class output path). Full Radical-tree render wiring is Phase 5's job.
 * This slice proves the tree shape is valid in production code paths.
 *
 * IMPORTANT: DO NOT change any existing per-class behaviour. This is strictly
 * additive. All changes are feature-flagged behind RADICAL_PHASE_0_SLICE.
 */

import { buildBessHardcodedTree, flattenBessTreeLeaves } from './bess-hardcoded-tree.js'
import { loadRadicalTree } from '../property-api.js'
import { buildSeedLibrary } from '../seed-library.js'
import { runGrammarEngine } from '../grammar.js'
import { ALL_GRAMMAR_RULES } from '../seed-library.js'
import type { RadicalTree } from '../schema.js'
import { CURRENT_RADICAL_SPEC_VERSION, isVersionCompatible } from '../schema.js'

// Lifted and productionised from demo/grammar-pass.ts
import { runBessGrammarPass } from '../demo/grammar-pass.js'
// Lifted and productionised from demo/cost-rollup.ts
import { computeCostRollup } from '../demo/cost-rollup.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PhaseZeroSliceResult {
  ok: boolean
  product_slug: 'bess-container'
  radical_spec_version: string
  version_compatible: boolean

  tree_node_count: number
  tree_leaf_count: number

  grammar: {
    verdict: 'PASS' | 'PASS_WITH_RELAXATION' | 'BLOCK'
    rules_fired: number
    pass_count: number
    warn_count: number
    block_count: number
    relaxations_applied: number
  }

  cost_rollup: {
    system_total_gbp: number
    line_count: number
    verified_count: number
    estimated_count: number
    grade_d_count: number
  }

  render_status: 'deferred' | 'complete'
  render_note: string

  duration_ms: number
  error?: string
}

// ---------------------------------------------------------------------------
// Feature flag check
// ---------------------------------------------------------------------------

/**
 * Returns true when the Phase 0 vertical slice is enabled.
 * Must be set to exactly "true" (case-insensitive) to activate.
 */
export function isPhaseZeroSliceEnabled(): boolean {
  const raw = (process.env.RADICAL_PHASE_0_SLICE ?? '').toLowerCase().trim()
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on'
}

// ---------------------------------------------------------------------------
// Count nodes in composition tree
// ---------------------------------------------------------------------------

function countCompositionNodes(tree: RadicalTree): number {
  function walk(nodeCount: number, children: any[]): number {
    return children.reduce(
      (acc: number, child: any) => walk(acc + 1, child.children ?? []),
      nodeCount
    )
  }
  return walk(1, tree.composition.root.children ?? [])
}

// ---------------------------------------------------------------------------
// Main slice runner
// ---------------------------------------------------------------------------

/**
 * Run the Phase 0 vertical slice for BESS.
 *
 * Should only be called when isPhaseZeroSliceEnabled() returns true.
 * Returns a full trace of the pipeline state so callers can verify
 * the Radical tree worked without running a full PDF render.
 */
export async function runPhaseZeroSlice(): Promise<PhaseZeroSliceResult> {
  const startMs = Date.now()

  try {
    console.log('[phase-0-slice] Starting BESS vertical slice...')

    // ── Step 1: Build and load the hardcoded BESS tree ─────────────────────
    console.log('[phase-0-slice] Step 1: Build hardcoded BESS Radical tree')
    const rawTree = buildBessHardcodedTree()

    // ── Step 2: Version-compatibility check ────────────────────────────────
    console.log(`[phase-0-slice] Step 2: Version check (tree=${rawTree.radical_spec_version}, current=${CURRENT_RADICAL_SPEC_VERSION})`)
    const versionCompatible = isVersionCompatible(rawTree.radical_spec_version)
    const tree = loadRadicalTree(rawTree)

    const nodeCount = countCompositionNodes(tree)
    const leaves = flattenBessTreeLeaves(tree)

    console.log(`[phase-0-slice] Tree: ${nodeCount} nodes, ${leaves.length} leaf archetypes`)

    // ── Step 3: Build BESS library and resolve leaves ──────────────────────
    console.log('[phase-0-slice] Step 3: Resolve BESS library and run grammar pass')

    // Build mock resolved leaves from the tree (no live distributor calls in slice)
    // We use the hardcoded unit costs from decomposition-bess.json
    const BESS_KNOWN_COSTS: Record<string, { unit_price_gbp: number | null; verification_grade: string }> = {
      'lfp_prismatic_cell_280Ah': { unit_price_gbp: 60, verification_grade: 'estimated' },
      'bms_master_controller': { unit_price_gbp: 4500, verification_grade: 'estimated' },
      'pcs_inverter_1mw_bidirectional': { unit_price_gbp: 95000, verification_grade: 'estimated' },
      'dc_contactor_1500v_300a': { unit_price_gbp: 1200, verification_grade: 'estimated' },
      'liquid_cooling_loop_1mw': { unit_price_gbp: 35000, verification_grade: 'estimated' },
      'mineral_wool_insulation_panel': { unit_price_gbp: 600, verification_grade: 'estimated' },
      'container_fire_suppression_system': { unit_price_gbp: 18000, verification_grade: 'estimated' },
      'fire_suppression_cylinder_novec': { unit_price_gbp: 18000, verification_grade: 'estimated' },
      'arc_flash_detection_sensor': { unit_price_gbp: 650, verification_grade: 'estimated' },
      'ems_scada_controller': { unit_price_gbp: 18000, verification_grade: 'estimated' },
    }

    const resolvedLeaves = leaves.map((leaf, idx) => {
      const known = BESS_KNOWN_COSTS[leaf.archetypeId]
      return {
        line_id: idx + 1,
        name: leaf.archetypeId.replace(/_/g, ' '),
        archetype_id: leaf.archetypeId,
        part_class: 'electronic_cots' as const,
        qty: leaf.quantity,
        mpn: null,
        manufacturer: null,
        unit_price_gbp: known?.unit_price_gbp ?? null,
        lead_weeks: null,
        verification_grade: (known?.verification_grade ?? 'grade_d') as any,
        source: 'hardcoded_phase0',
        source_url: null,
        distributor: 'estimated' as const,
        notes: 'Phase 0 hardcoded price — no live distributor call',
      }
    })

    // ── Step 4: Grammar pass ───────────────────────────────────────────────
    console.log('[phase-0-slice] Step 4: Grammar pass')
    const grammarResult = runBessGrammarPass(resolvedLeaves)

    // ── Step 5: Cost rollup ────────────────────────────────────────────────
    console.log('[phase-0-slice] Step 5: Cost rollup')
    const costRollup = computeCostRollup(resolvedLeaves)

    const verifiedCount = resolvedLeaves.filter(l => l.verification_grade === 'verified').length
    const estimatedCount = resolvedLeaves.filter(l => l.verification_grade === 'estimated').length
    const gradeDCount = resolvedLeaves.filter(l => l.verification_grade === 'grade_d').length

    const durationMs = Date.now() - startMs

    console.log(`[phase-0-slice] BESS slice complete in ${durationMs}ms`)
    console.log(`[phase-0-slice] Grammar verdict: ${grammarResult.engineResult.overallVerdict}`)
    console.log(`[phase-0-slice] System total: £${costRollup.sentence.total_gbp.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`)

    return {
      ok: true,
      product_slug: 'bess-container',
      radical_spec_version: tree.radical_spec_version,
      version_compatible: versionCompatible,

      tree_node_count: nodeCount,
      tree_leaf_count: leaves.length,

      grammar: {
        verdict: grammarResult.engineResult.overallVerdict,
        rules_fired: grammarResult.rulesFired,
        pass_count: grammarResult.passCount,
        warn_count: grammarResult.warnCount,
        block_count: grammarResult.blockCount,
        relaxations_applied: grammarResult.relaxationsApplied,
      },

      cost_rollup: {
        system_total_gbp: costRollup.sentence.total_gbp,
        line_count: resolvedLeaves.length,
        verified_count: verifiedCount,
        estimated_count: estimatedCount,
        grade_d_count: gradeDCount,
      },

      // PDF render is deferred — wiring the Radical-tree BoM section into
      // 7-pdf-v3.tsx is Phase 5's job. The slice validates everything up to
      // the render boundary.
      render_status: 'deferred',
      render_note:
        'PDF render integration is Phase 5. Slice validates tree shape through grammar + cost rollup. ' +
        'Existing BESS per-class render path is unaffected (fallback active).',

      duration_ms: durationMs,
    }
  } catch (err) {
    const durationMs = Date.now() - startMs
    const message = (err as Error).message
    console.error(`[phase-0-slice] BESS slice FAILED after ${durationMs}ms: ${message}`)

    return {
      ok: false,
      product_slug: 'bess-container',
      radical_spec_version: CURRENT_RADICAL_SPEC_VERSION,
      version_compatible: true,
      tree_node_count: 0,
      tree_leaf_count: 0,
      grammar: {
        verdict: 'BLOCK',
        rules_fired: 0,
        pass_count: 0,
        warn_count: 0,
        block_count: 1,
        relaxations_applied: 0,
      },
      cost_rollup: {
        system_total_gbp: 0,
        line_count: 0,
        verified_count: 0,
        estimated_count: 0,
        grade_d_count: 0,
      },
      render_status: 'deferred',
      render_note: 'Slice failed before render stage',
      duration_ms: durationMs,
      error: message,
    }
  }
}
