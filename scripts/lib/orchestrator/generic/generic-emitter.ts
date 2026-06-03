/**
 * scripts/lib/orchestrator/generic/generic-emitter.ts
 *
 * GENERIC EMITTER (wall-3 miss-fallback — GENERIC-EMITTER-PLAN.md §3).
 *
 * `emitGenericDesign` is the class-agnostic counterpart to the per-class emitters
 * in `emitters/<class>.ts`. It is invoked from `assembler.ts` §4 (the registry
 * miss-fallback) ONLY when `UNIVERSAL_GENERIC_EMITTER=1`, so the 35 registered
 * classes never reach it → zero regression surface.
 *
 * PHASE-1 (2026-06-03, after the Experiment-A HYBRID verdict): the rough scaffold
 * (one placeholder word per graph node, no cross-links) proved structurally
 * complete but far too thin to councilise. Phase-1 makes it COMPONENT-level:
 *   - structure from the class-reference graph NODES (Tier B),
 *   - 5-7 real component words per module from the corpus
 *     (`pretraining_products.modules_json`, Tier A) — see derive-skeleton.ts,
 *   - cross_module_grammar_links from the graph edges + the class-connections
 *     required-link registry — see build-links.ts,
 *   - real parts supplied DOWNSTREAM by the chain's completeEmitterGaps +
 *     fillBlankWordMpns (the component words are true gate-23 gaps, catalogue-typed
 *     so the grounder fills them), and contract-derived quantities,
 *   - still NO bespoke coupled-physics sizing (exactly what Experiment A measures
 *     the absence of; the target is ≥6-honest HYBRID, not the 9.28 golden).
 *
 * Output type is `DesignJSON`, identical to every per-class emitter, so
 * `finalise()` + the entire downstream pipeline (narrator, 31 gates, pricing,
 * render) run class-agnostically and are inherited for free.
 *
 * British spelling throughout.
 */

import type { BriefEnvelope, ContractInProgress, ParsedConstraints } from '../types'
import type { DesignJSON } from '../assembler'
import {
  getClassReferenceGraphDBFirst,
  resolveClassGraphSlug,
} from '../../../../src/lib/pdf-engine-v2/lib/knowledge/class-reference-graph-db'
import { deriveGenericSkeleton } from './derive-skeleton'
import { loadClassComponents } from './component-source'
import { buildCrossModuleLinks } from './build-links'

/**
 * Emit a DesignJSON generically from the class-reference graph + corpus components.
 *
 * @throws if no class-reference graph resolves for the class — the honest failure
 *         mode (better than a hollow PDF). The graph is seeded on-miss by the K10
 *         bootstrap path; for a forced holdout the registered graph is read DB-first.
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

  // Tier A: union the real component lists for this class from the corpus
  // (pretraining_products.modules_json). Empty on any miss → derive-skeleton's
  // Tier-C floor fills every module, so this never hard-fails.
  const componentsByModule = loadClassComponents(envelope.class)

  const modules = deriveGenericSkeleton(graph, brief, envelope, contract, componentsByModule)

  // Cross-module links from the real graph topology + the per-class required-link
  // registry (oriented so the directional grammar gates pass). Candidate class
  // keys cover both the fine envelope class and the contract's product_class so
  // the required-links registry resolves whichever the chain's gate uses.
  const links = buildCrossModuleLinks(graph, [
    envelope.class,
    String((contract as { product_class?: unknown }).product_class ?? ''),
  ])

  const corpusModules = [...componentsByModule.keys()].length
  return {
    modules,
    cross_module_grammar_links: links,
    excluded_modules: [],
    rationale_excluded:
      `Generic emitter (wall-3 Phase-1): ${modules.length} modules derived from the ` +
      `${graph.product_class} class-reference graph; ${corpusModules > 0 ? `component detail unioned from the corpus (${corpusModules} module group(s))` : 'component detail from the universal taxonomy floor'}; ` +
      `${links.length} cross-module links from graph edges + required-connection registry. ` +
      `OPTIONAL modules the brief does not signal are pruned downstream by applyBriefScopeFilter; ` +
      `real parts + exact MPNs are supplied by the chain's emitter-completion + fill-blank-MPN passes.`,
    brief_overview_prose: {
      overview_and_context: '',
      mission_statement: '',
      target_customers: '',
      why_now: '',
    },
  }
}
