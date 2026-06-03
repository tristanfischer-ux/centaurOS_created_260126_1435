/**
 * scripts/lib/orchestrator/generic/generic-emitter.ts
 *
 * GENERIC EMITTER (wall-3 miss-fallback — GENERIC-EMITTER-PLAN.md §3).
 *
 * `emitGenericDesign` is the class-agnostic counterpart to the per-class
 * emitters in `emitters/<class>.ts`. It is invoked from `assembler.ts` §4
 * (the registry miss-fallback) ONLY when `UNIVERSAL_GENERIC_EMITTER=1`, so the
 * 35 registered classes never reach it → zero regression surface.
 *
 * Today it is the ROUGH Experiment-A path: structure from the class-reference
 * graph (Tier B), real parts supplied by the downstream gap-filler, no bespoke
 * sizing. It exists to answer the one existential wall-3 question — can a
 * GENERIC dossier (structure + real DB parts + honest concept-stage deferral)
 * score within reach of the hand-built golden? — by forcing a KNOWN class
 * (BESS) down it with the hand emitter held out (`EXP_A_HOLDOUT_CLASS=bess`)
 * and councilling the result against the 9.28 golden.
 *
 * Output type is `DesignJSON`, identical to every per-class emitter, so
 * `finalise()` + the entire downstream pipeline (narrator, 31 gates, pricing,
 * render) run class-agnostically and are inherited for free.
 *
 * SCAFFOLD NOTE (2026-06-03): the cross_module_grammar_links (from graph edges),
 * the gate-20 pick-verified-part firewall (§3), and the LLM sizing-refinement
 * layer (§10) are Phase-1/2/3 work, gated behind the Experiment-A result.
 */

import type { BriefEnvelope, ContractInProgress, ParsedConstraints } from '../types'
import type { DesignJSON } from '../assembler'
import {
  getClassReferenceGraphDBFirst,
  resolveClassGraphSlug,
} from '../../../../src/lib/pdf-engine-v2/lib/knowledge/class-reference-graph-db'
import { deriveGenericSkeleton } from './derive-skeleton'

/**
 * Emit a DesignJSON generically from the class-reference graph.
 *
 * @throws if no class-reference graph resolves for the class — the honest
 *         failure mode (better than a hollow PDF). The fresh session seeds a
 *         graph (or relies on bootstrap-on-miss) before forcing the path.
 */
export async function emitGenericDesign(
  contract: ContractInProgress,
  brief: ParsedConstraints,
  envelope: BriefEnvelope,
): Promise<DesignJSON> {
  const slug = resolveClassGraphSlug(envelope.class)
  const graph = await getClassReferenceGraphDBFirst(slug)

  if (!graph || !Array.isArray(graph.nodes) || graph.nodes.length === 0) {
    throw new Error(
      `generic emitter: no class-reference graph for class='${envelope.class}' ` +
        `(resolved slug='${slug}'). Seed a graph in ` +
        `src/lib/pdf-engine-v2/class-reference-graphs/ (or rely on bootstrap-on-miss) ` +
        `before forcing the generic path.`,
    )
  }

  const modules = deriveGenericSkeleton(graph, brief, envelope, contract)

  return {
    modules,
    cross_module_grammar_links: [], // §3 Tier B edges → links: Phase-1 build
    excluded_modules: [],
    rationale_excluded:
      'Generic emitter (wall-3 Experiment-A scaffold): module set derived from the ' +
      'class-reference graph; OPTIONAL modules the brief does not signal are pruned ' +
      'downstream by applyBriefScopeFilter.',
    brief_overview_prose: {
      overview_and_context: '',
      mission_statement: '',
      target_customers: '',
      why_now: '',
    },
  }
}
