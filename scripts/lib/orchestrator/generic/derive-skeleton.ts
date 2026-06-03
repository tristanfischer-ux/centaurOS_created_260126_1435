/**
 * scripts/lib/orchestrator/generic/derive-skeleton.ts
 *
 * GENERIC STRUCTURE DERIVER (wall-3, GENERIC-EMITTER-PLAN.md §3 Tier B).
 *
 * Pure function: (class-reference graph, brief, envelope, contract) → DesignModule[].
 * Turns the typed class-reference graph's NODES (each `class` is a universal
 * module, with a `required` flag + human `display` label) into the module /
 * sub_module / word skeleton the rest of the pipeline expects. One seed
 * sub_module per node; the downstream universal passes enrich it for free:
 *   - splitDenseSubModulesByRadical (in assembler.finalise) expands thin nodes,
 *   - applyBriefScopeFilter (in finalise) prunes OPTIONAL modules the brief
 *     doesn't signal,
 *   - completeEmitterGaps (chain, BEFORE gate-23) fills each seed word's
 *     honest "specify at detailed design" placeholder with a real DB-first MPN,
 *   - the Phase-2 narrator writes the prose, Engine-B/C price the BoM, and all
 *     31 gates validate.
 *
 * This is deliberately ROUGH — it carries NO bespoke coupled-physics sizing
 * (that is the ~4,710-line hand BESS emitter's value, and exactly what
 * Experiment A measures the absence of). Quantities come only from the
 * contract; nothing is invented here (same invariant as the hand emitters).
 *
 * SCAFFOLD NOTE (2026-06-03): authored for the BESS-golden holdout (Experiment
 * A). Tier A (pretraining_products.modules_json union) + Tier C (taxonomy floor)
 * from §3 are deferred to the Phase-1 build; Tier B (graph nodes) alone is
 * enough to render a structurally-complete dossier for the holdout.
 */

import type { BriefEnvelope, ContractInProgress, ParsedConstraints } from '../types'
import type { DesignModule } from '../assembler'
import type { GraphNode, ProductClassGraph } from '../../../../src/lib/pdf-engine-v2/class-reference-graph'
import { cc, makeSubModule, mod, word, type SubModule } from './emitter-primitives'

/**
 * Derive the module skeleton from a class-reference graph.
 *
 * @param graph    the typed class-reference graph (DB-first or baked TS)
 * @param _brief   parsed brief constraints (reserved — Tier C taxonomy floor)
 * @param _envelope brief envelope (reserved — scale-tier-aware structure)
 * @param contract the validated engineering contract (source of quantities)
 */
export function deriveGenericSkeleton(
  graph: ProductClassGraph,
  _brief: ParsedConstraints,
  _envelope: BriefEnvelope,
  contract: ContractInProgress,
): DesignModule[] {
  // Surface the contract's scalar quantities on the PRINCIPAL node so the
  // headline numbers reach the spec / Brief-Compliance tables. Non-principal
  // nodes start empty; downstream tool outputs + the narrator fill the rest.
  // Quantities are COPIED, never invented.
  const principalParams: Record<string, number | string> = {}
  const quantities = contract.quantities ?? {}
  for (const [key, raw] of Object.entries(quantities)) {
    const val = (raw as { value?: unknown } | undefined)?.value
    if (typeof val === 'number' || typeof val === 'string') principalParams[key] = val
  }

  return graph.nodes.map((node: GraphNode): DesignModule => {
    const moduleName = String(node.class)
    const label = node.display ?? moduleName
    const seedId = `${moduleName}__principal`

    const seedWord = word(
      seedId,
      label,
      cc(seedId, label, null, null),
      // Honest deferral. completeEmitterGaps() runs BEFORE gate-23 and replaces
      // this with a real DB-first MPN (DB-first → generate-on-miss → writeback);
      // if no real part is found the word stays honestly marked, never faked.
      [mod('part_number', 'specify at detailed design')],
    )

    const sm: SubModule = makeSubModule(
      `${moduleName}__primary`,
      label,
      'provides',
      `Primary functional element of the ${moduleName} module.`,
      [seedWord],
    )

    return {
      module: moduleName,
      module_brief: label,
      overview_paragraph_en: '', // narrator populates
      derived_parameters: node.role === 'principal' ? principalParams : {},
      allowed_radicals: [],
      applicability_confidence: node.required ? 'high' : 'medium',
      sub_modules: [sm],
    }
  })
}
