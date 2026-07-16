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
// E6a (tracker #22): bootstrap-on-miss for the class-reference graph. A NOVEL
// slug (W0-minted or plain registry-miss) has no graph in the DB or baked TS —
// previously a hard throw (exit 7). The bootstrap harvests one (corpus-first +
// ONE structured LLM call), validates deterministically, stores a G1
// 'candidate' row in forge-truth.db class_graph_candidates, and hands the
// graph back IN-MEMORY for this run only (no auto-promotion to the canonical
// class_reference_graphs table). Env-gated CLASS_GRAPH_BOOTSTRAP (default ON;
// =0 disables). Scope-safe: this code path is only reachable on the
// UNIVERSAL_GENERIC_EMITTER registry-miss path — registered classes always
// resolve their graph above and never get here.
import { bootstrapClassGraph } from './bootstrap-class-graph'
// E2 (2026-06-10): the sizing-family PLUG-IN REGISTRY replaces the legacy
// single-family applyFamilySizing call. Importing the barrel registers every
// family (battery / process-plant / aero-platforms) and composes all that
// score above threshold over a shared quantity namespace. `applySizingFamilies`
// merges the deltas (word modifiers via the same mergeMods → BATTERY byte-
// identity). The legacy applyFamilySizing stays in ./sizing as the regression
// oracle but is no longer on the production path.
import { applySizingFamilies } from '../sizing-families'
// 2026-06-13 (Tristan: "everything needs to be derived from the physics engine and
// the Blender should faithfully reflect the physics"). The fixed module×word skeleton
// + family tables never DERIVE an archetype's real equipment from the contract — a RAS
// shipped 0 of its 10 rearing tanks. This universal pass reads the contract's self-
// describing quantity KEYS, sizes every matching word from the computed physics (real
// dimension + count + rating), and SYNTHESISES the principal equipment the skeleton
// omitted (the tanks, the biofilter, the degasser) into the right module — no per-class
// table, any archetype. Geometry + BoM + cost then consume the same physics-sized words.
import { applyUniversalContractSizing } from './universal-contract-sizing'

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
  let slug = resolveClassGraphSlug(envelope.class)
  // SCALE-AWARE GRAPH SELECTION (2026-07-10, Powerwall exit-32 round 4): the alias map
  // sends every energy-storage slug to the CONTAINERISED utility graph, whose own scope
  // notes exclude residential ("different module set — residential would use
  // `residential_ess` graph when seeded"). A sub-utility design (nameplate < 100 kWh —
  // the same containerised threshold as the pricing override gate) inherited the ISO
  // container, grid step-up transformer, 25 kW HVAC and glycol chiller loop from that
  // graph — every one a wrong-product-class part the audits then flagged. Route it to
  // the residential graph instead. Keyed ONLY on the design's own energy scale; a
  // utility brief (≥ 100 kWh) or any other class is byte-identical.
  if (slug === 'bess-utility-scale') {
    const nameplateKwh = Number(
      (contract as { quantities?: Record<string, { value?: unknown }> })?.quantities?.nameplate_capacity_kwh?.value,
    )
    if (Number.isFinite(nameplateKwh) && nameplateKwh > 0 && nameplateKwh < 100) {
      slug = 'residential-battery-storage'
      console.error(
        `[generic-emitter] scale-aware graph selection: nameplate ${nameplateKwh} kWh < 100 kWh ` +
          `— using 'residential-battery-storage' (wall-mount all-in-one) instead of the containerised utility graph`,
      )
    }
  }
  let graph = await getClassReferenceGraphDBFirst(slug)
  // G4 provenance of the graph the skeleton derives from.
  let graphProvenance = 'db-first/baked'

  if (!graph || !Array.isArray(graph.nodes) || graph.nodes.length === 0) {
    // E6a bootstrap-on-miss (default ON for this registry-miss-only path).
    const bootstrapEnabled = process.env.CLASS_GRAPH_BOOTSTRAP !== '0'
    if (bootstrapEnabled) {
      console.error(
        `[generic-emitter] no class-reference graph for class='${envelope.class}' (resolved slug='${slug}') ` +
          `— invoking E6a bootstrap-on-miss (corpus-first + one ${'google/gemini-3.5-flash'} harvest, G1 candidate store)`,
      )
      const boot = await bootstrapClassGraph(slug, brief, envelope)
      if (boot.ok) {
        graph = boot.graph
        graphProvenance =
          `${boot.provenance} (candidate_id=${boot.candidate.id}, version=${boot.candidate.version}, ` +
          `status=${boot.candidate.status}, reused=${boot.candidate.reused}, attempts=${boot.attempts})`
        console.error(
          `[generic-emitter] graph BOOTSTRAPPED for slug='${boot.candidate.slug}': ` +
            `${graph.nodes.length} nodes / ${graph.edges.length} edges — ${graphProvenance}. ` +
            `Stored row stays 'candidate' (G1): NOT promoted to class_reference_graphs.`,
        )
      } else {
        // G3: honest structured failure record — the chain keeps its exit-7.
        throw new Error(
          `generic emitter: no class-reference graph for class='${envelope.class}' (resolved slug='${slug}') ` +
            `AND bootstrap-on-miss FAILED — honest bootstrap-failure record: ` +
            JSON.stringify({
              stage: boot.stage,
              attempts: boot.attempts,
              error: boot.error,
              validation_errors: boot.validation_errors.slice(0, 10),
            }) +
            `. Fix: re-run (transient LLM failure), seed a graph in src/lib/pdf-engine-v2/class-reference-graphs/, ` +
            `or inspect class_graph_candidates in ~/.forge-truth/forge-truth.db.`,
        )
      }
    } else {
      throw new Error(
        `generic emitter: no class-reference graph for class='${envelope.class}' ` +
          `(resolved slug='${slug}') and CLASS_GRAPH_BOOTSTRAP=0 disabled bootstrap-on-miss. ` +
          `Seed a graph in src/lib/pdf-engine-v2/class-reference-graphs/ or re-enable the bootstrap.`,
      )
    }
  }

  // Tier A: union the real component lists for this class from the corpus
  // (pretraining_products.modules_json). Empty on any miss → derive-skeleton's
  // Tier-C floor fills every module, so this never hard-fails.
  const componentsByModule = loadClassComponents(envelope.class)

  const modules = deriveGenericSkeleton(graph, brief, envelope, contract, componentsByModule)

  // Per-class-FAMILY SIZING (E2 plug-in registry): every family scoring above
  // threshold for this class composes in dependency order over a shared quantity
  // namespace, attaching the contract's coupled-physics quantities (real counts +
  // ratings) onto the component words AND deriving the family budget (e.g. aero
  // wing area / cruise power / battery mass). The caller merges the deltas; the
  // BATTERY family is byte-identical to the legacy path. Closes the Phase-1
  // under-provisioning (the lone wall from the Phase-1 verdict). A class no family
  // claims is left un-sized (Phase-1 baseline structure stands).
  //
  // LOUD-FAILURE policy (G6): a structured SizingFamilyError (missing / unit-
  // mismatched / out-of-range required quantity, or a composition conflict) is a
  // real engineering-input gap. We surface it as an honest emitter note + leave
  // the structure un-sized rather than crash the whole generic emit; the gates +
  // physics critic then flag the thin sizing (better than a hollow PDF, per G3).
  let sizing: { families: string[]; sized: number } = { families: [], sized: 0 }
  let sizingError: string | null = null
  try {
    const applied = applySizingFamilies(
      modules as never[],
      contract,
      brief,
      envelope.class,
      // E1 seam: the canonical envelope-vector is produced by E1; pass the
      // BriefEnvelope structurally (carries class/scale_tier/form_factor) until
      // the envelope-vector is threaded here post-merge.
      envelope as never,
    )
    sizing = { families: applied.families, sized: applied.sized }
  } catch (err) {
    sizingError = err instanceof Error ? err.message : String(err)
  }

  // PHYSICS-DERIVED EQUIPMENT (universal, no per-class table). Runs AFTER the family
  // plug-ins so curated/grounded dimensions win; it fills the gap they leave: it sizes
  // every still-unsized word that a contract quantity describes, and synthesises the
  // principal process equipment the skeleton never emitted. This is the move that makes
  // the design + the Blender faithfully reflect the physics the contract computed.
  let physicsEquipment = { sized: 0, synthesized: 0 }
  try {
    // Brief target metrics (demand-coverage rule 4): the orchestrator's flattened
    // ParsedConstraints carries the parsed brief's target_performance object verbatim —
    // metrics[] when the brief lists several, else the headline {value,unit} as one row
    // (the same fallback the workbook's compliance matrix + the chain's floor probe use).
    const tp = brief?.target_performance as
      | { value?: unknown; unit?: string; metrics?: Array<Record<string, unknown>> }
      | undefined
    const briefMetrics = (Array.isArray(tp?.metrics) && tp.metrics.length > 0
      ? tp.metrics
      : tp && Number.isFinite(Number(tp.value)) ? [tp] : []) as never[]
    // INTENT (2026-07-16 Poseidon): bench instruments must NOT run plant synthesis
    // (circulation pumps, expansion reservoirs, SCADA, access ladders, building
    // take-off). Detect form via class + contract quantities unique to the
    // syringe-pump / thermocycler / optical archetype builders — never a brand noun.
    const _pc = String((contract as { product_class?: unknown }).product_class ?? '').toLowerCase()
    const _q = (contract as { quantities?: Record<string, { value?: unknown }> }).quantities ?? {}
    const _enc = Number(_q.enclosure_volume_m3?.value)
    const _isBenchInstrument =
      /syringe[_ -]?pump|thermo[_ -]?cycler|thermal[_ -]?cycler|\bpcr\b|colorimeter|colourimeter|spectrophotometer|optical[_ -]?instrument/.test(_pc)
      || (Number.isFinite(_enc) && _enc > 0 && _enc < 1 && (
        (Number(_q.channel_count?.value) >= 1 && Number(_q.lead_screw_pitch_mm?.value) > 0)
        || Number(_q.max_syringe_volume_ml?.value) > 0
      ))
    const r = applyUniversalContractSizing(modules as never[], contract, {
      onlyUnsized: true,
      // Device-scale: keep contract sizing on existing words; do not mint plant equipment.
      synthesizeMissing: !_isBenchInstrument,
      instrument: !_isBenchInstrument,
      explode: !_isBenchInstrument,
      briefMetrics,
    })
    physicsEquipment = { sized: r.sized, synthesized: r.synthesized }
    if (r.sized || r.synthesized) {
      console.error(
        `[generic-emitter] physics-derived equipment: ${r.sized} word(s) sized from the contract; ` +
          `${r.synthesized} principal item(s) synthesised (${r.synthesizedPhrases.join(', ') || '—'}).`,
      )
    }
  } catch (err) {
    console.error(
      `[generic-emitter] universal contract sizing failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
    )
  }

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
      `${graph.product_class} class-reference graph [graph provenance: ${graphProvenance}]; ${corpusModules > 0 ? `component detail unioned from the corpus (${corpusModules} module group(s))` : 'component detail from the universal taxonomy floor'}; ` +
      `${links.length} cross-module links from graph edges + required-connection registry; ` +
      `${sizing.families.length > 0 ? `${sizing.sized} component words sized by sizing-family plug-in(s) [${sizing.families.join(', ')}] composing over the contract physics` : (sizingError ? `sizing-family layer reported a structured gap (${sizingError}) — structure left un-sized, gates will flag` : 'no sizing-family claims this class (Phase-1 baseline structure)')}. ` +
      `${physicsEquipment.sized || physicsEquipment.synthesized ? `Physics-derived equipment pass (universal, contract-keyed): ${physicsEquipment.sized} word(s) sized from the computed quantities + ${physicsEquipment.synthesized} principal equipment item(s) synthesised from the contract. ` : ''}` +
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
