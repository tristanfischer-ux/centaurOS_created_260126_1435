/**
 * scripts/lib/orchestrator/auto-plan-fallback.ts
 *
 * WALL-2 SAFE FALLBACK — wire the inert auto-planner (auto-planner.ts ::
 * composeToolGraph) into the orchestrator as a FALLBACK for UNREGISTERED
 * (novel) product classes, so an unseen class composes a tool graph from
 * declared tool I/O instead of dying at `selectPlan → null → exit 7`.
 *
 * SCOPE + SAFETY (deliberately conservative — first wire, fully reversible):
 *   - This path is reached ONLY when `selectPlan(envelope)` returns null,
 *     i.e. NO hand-written ClassToolPlan matched the envelope. Every one of
 *     the 35 registered classes matches a plan, so they NEVER enter here —
 *     the effect on existing classes is exactly ZERO.
 *   - It is gated behind env `UNIVERSAL_AUTO_PLAN=1` (default OFF). With the
 *     flag off, `composeFallbackPlan` returns null and the orchestrator keeps
 *     its CURRENT loud-failure behaviour verbatim.
 *   - Every synthesised ToolStep is `required: false`. A composed graph for a
 *     never-seen class is necessarily imperfect (the wall-2 design council
 *     returned plan_is_sound:false on FULL activation — over-selection +
 *     unmet inputs); marking steps non-fatal means a tool that errors or
 *     hangs cannot halt the plan. The orchestrator therefore advances past
 *     wall-2 (selectPlan) to its NEXT wall (the assembler, wall-3) regardless
 *     of whether any composed tool actually succeeds at runtime — which is
 *     the measurable "gets further through the chain" win this wire targets.
 *   - The synthesised `contract_update` does NOT blind-map arbitrary tool
 *     outputs onto contract quantity keys (the per-tool output mapping lives
 *     in the hand-written class-plans and is only ~30% recoverable from the
 *     static manifest). It writes a single provenance breadcrumb quantity so
 *     diagnostics/attribution can see the composed plan executed, without
 *     risking a mis-mapped engineering number entering the contract.
 *
 * WHAT THIS DOES NOT DO (honest scope): it does not make a novel class RENDER
 * a good dossier. Wall-3 (a generic graph-driven emitter) + wall-4 (generic
 * contract quantities) + wiring the dead class-ref writeback remain. See
 * UNIVERSAL-ENGINE-PLAN.md. This is one wall, safely.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { composeToolGraph, type ToolIOSchema, type ComposedToolGraph } from './auto-planner'
import { getTool } from './registry'
import type {
  BriefEnvelope,
  ClassToolPlan,
  ContractInProgress,
  ParsedConstraints,
  ToolStep,
} from './types'

/** Env flag — default ON (flipped 2026-06-03, Tristan-authorised). The wall-2
 *  fallback affects ONLY unregistered/novel classes — all ~35 registered classes
 *  match a hand-written ClassToolPlan first, so they bypass it entirely — and every
 *  composed ToolStep is `required:false` (non-fatal), so it can neither alter nor
 *  halt any existing class. A novel class now composes-and-advances past wall-2
 *  instead of hard-failing; it still won't render a finished dossier until the
 *  generic emitter (wall-3) lands, but "fails later with a composed plan" beats
 *  "fails immediately". The over-selection prune (same commit family) makes the
 *  composed plan cleaner than when this defaulted off. Escape hatch: set
 *  UNIVERSAL_AUTO_PLAN=0 to disable. */
export function autoPlanEnabled(): boolean {
  return process.env.UNIVERSAL_AUTO_PLAN !== '0'
}

/**
 * Universal "buildable-design" required outputs — the minimal set of quantity
 * keys ANY industrial product's design should produce (mass, headline power,
 * thermal rejection, and cost-stack drivers). Kept DELIBERATELY SMALL: a large
 * required set causes composeToolGraph to over-select (its backward-chaining
 * pulls in any tool whose output loosely key-matches an intermediate input).
 * A tight set keeps the composed plan focused. These are class-agnostic.
 */
const UNIVERSAL_REQUIRED_OUTPUTS: readonly string[] = [
  'total_system_mass_kg', // overall mass (mass-aggregator)
  'cost_estimate_gbp',    // certification / cost-stack driver
  'transport_cost_gbp',   // logistics cost driver
]

/** Quantity keys the brief itself supplies — chain terminators for the
 *  backward-chainer (a need the brief provides is not re-derived by a tool). */
function briefKeysFrom(constraints: ParsedConstraints): string[] {
  const keys: string[] = []
  if (constraints.target_performance?.value != null) {
    keys.push('rated_power_kw', 'rated_power', 'target_performance')
  }
  if (constraints.max_mass_kg?.value != null) keys.push('max_mass_kg', 'brief_mass_cap_kg')
  if (constraints.voltage_class_v != null) keys.push('voltage_class_v')
  if (constraints.unit_cost_ceiling?.value != null) keys.push('unit_cost_ceiling')
  return keys
}

/** Load the checked-in tool-I/O manifest (harvested from the 35 class-plans by
 *  harvest-tool-io.ts) and project it to the auto-planner's ToolIOSchema. Only
 *  tools that (a) declare at least one output key AND (b) are actually present
 *  in the live tool registry are eligible — so the composed plan never names a
 *  tool the executor can't invoke. */
let _manifestCache: ToolIOSchema[] | null = null
export function loadToolIORegistry(): ToolIOSchema[] {
  if (_manifestCache) return _manifestCache
  const manifestPath = join(__dirname, 'tool-io-manifest.json')
  let raw: Record<string, { input_keys?: string[]; output_keys?: string[] }>
  try {
    raw = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  } catch {
    _manifestCache = []
    return _manifestCache
  }
  const schemas: ToolIOSchema[] = []
  for (const [tool_id, io] of Object.entries(raw)) {
    const output_keys = io.output_keys ?? []
    if (output_keys.length === 0) continue          // no declared outputs → can't be a producer
    const tool = getTool(tool_id)
    if (!tool) continue                             // not registered → executor couldn't run it
    // Carry the live registry's engineering domain onto the schema so the
    // auto-planner can use it for diagnostics + deterministic domain-aware
    // tie-breaks. (Previously dropped — the schema's optional `domain` was
    // always undefined even though every registered Tool declares one.)
    schemas.push({ tool_id, input_keys: io.input_keys ?? [], output_keys, domain: tool.domain })
  }
  // Deterministic order (composeToolGraph picks the FIRST applicable producer).
  schemas.sort((a, b) => a.tool_id.localeCompare(b.tool_id))
  _manifestCache = schemas
  return _manifestCache
}

/** Test seam: reset the manifest cache. */
export function _resetManifestCacheForTests(): void {
  _manifestCache = null
}

/**
 * Build a runnable ClassToolPlan for a novel class from a composed tool graph,
 * OR return null (→ caller keeps current behaviour). Returns null when:
 *   - the env flag is off, or
 *   - the manifest is empty / no tools registered, or
 *   - composeToolGraph selects zero tools for this brief.
 *
 * `registryOverride` is for tests (inject a synthetic manifest).
 */
export function composeFallbackPlan(
  envelope: BriefEnvelope,
  constraints: ParsedConstraints,
  registryOverride?: ToolIOSchema[],
): { plan: ClassToolPlan; graph: ComposedToolGraph } | null {
  if (!autoPlanEnabled()) return null

  const registry = registryOverride ?? loadToolIORegistry()
  if (registry.length === 0) return null

  const graph = composeToolGraph(
    [...UNIVERSAL_REQUIRED_OUTPUTS],
    registry,
    briefKeysFrom(constraints),
    envelope.class,
  )
  if (graph.order.length === 0) return null

  const tools: ToolStep[] = graph.order.map((tool_id) =>
    synthesiseStep(tool_id, graph),
  )

  const plan: ClassToolPlan = {
    id: `auto-plan/${envelope.class}/${envelope.scale_tier}`,
    envelope_predicate: () => true, // only ever consulted on this synthesised instance
    tools,
    // The auto-planner already condensed cycles; expose them so the executor's
    // fixed-point loop runs the coupled tools together. Cap iterations low —
    // a synthesised plan should not loop expensively for an unseen class.
    coupled_pairs: graph.coupled_pairs,
    max_iterations: 3,
    convergence_tolerance_pct: 5,
    consistency_rules: [], // no class-specific cross-tool rules for a novel class
  }
  return { plan, graph }
}

/**
 * Synthesise a single generic ToolStep. The step is intentionally minimal +
 * NON-FATAL: it offers the tool a generic contract-derived payload, and on
 * success records only a provenance breadcrumb (NOT a blind output→quantity
 * map — see module header for why). `required: false` guarantees a tool
 * failure cannot halt the composed plan.
 */
function synthesiseStep(tool_id: string, graph: ComposedToolGraph): ToolStep {
  const feeds_into = graph.feeds_into
    .filter((e) => e.from === tool_id)
    .map((e) => e.to)
  return {
    tool_id,
    input_from_contract: (c: Readonly<ContractInProgress>, brief: ParsedConstraints) => ({
      // Generic payload: tools that ignore it are unaffected; tools that read
      // typed fields can pick them up. The executor wraps invoke() in try/catch
      // so a tool that rejects this shape simply yields a non-fatal failure.
      envelope: c.envelope,
      quantities: c.quantities,
      brief,
    }),
    contract_update: (c: ContractInProgress) => ({
      ...c,
      quantities: {
        ...c.quantities,
        [`auto_planned_tool_ran__${tool_id.replace(/[^a-z0-9]+/gi, '_')}`]: {
          value: 1,
          unit: 'flag',
          family: 'dimensionless' as const,
          basis: 'typical' as const,
          scope: 'system' as const,
          uncertainty_pct: 0,
          temporal_resolution_s: null,
          condition: 'auto-planner fallback breadcrumb (unregistered class)',
          provenance: { source: `tool:${tool_id}` as const, tool_id },
        },
      },
    }),
    required: false, // SAFETY: a composed-plan tool can never halt the plan
    feeds_into,
  }
}
