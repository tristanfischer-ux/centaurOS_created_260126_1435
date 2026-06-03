/**
 * scripts/lib/orchestrator/assembler.ts
 *
 * DESIGN ASSEMBLER — mechanical instantiation of a DesignJSON from a
 * completed Contract.
 *
 * Build #20a (2026-05-22): refactored from hardcoded if-else to a
 * registry pattern. Per-class emitters live in
 * `scripts/lib/orchestrator/emitters/<class>.ts` and call
 * `registerAssembler(class_or_class_scale_key, emitterFn)` at module
 * load. The chain imports `register-all.ts` which transitively imports
 * every per-class emitter so the registry is fully populated before
 * any orchestrateDesign() call.
 *
 * The assembler ONLY produces structure — module / sub_module / word
 * skeletons with quantities and provenance. Prose fields
 * (overview_paragraph_en, english_sentence, brief_overview_prose.*)
 * are left empty for the LLM narrator to populate downstream.
 */

import type {
  BriefEnvelope,
  ContractInProgress,
  ParsedConstraints,
} from './types'
import { splitDenseSubModulesByRadical } from './submodule-splitter'
import { applyBriefScopeFilter } from './brief-scope-filter'

export interface DesignJSON {
  modules: Array<DesignModule>
  cross_module_grammar_links: unknown[]
  excluded_modules: string[]
  rationale_excluded: string
  brief_overview_prose: {
    overview_and_context: string
    mission_statement: string
    target_customers: string
    why_now: string
  }
}

export interface DesignModule {
  module: string
  // Optional human-facing label for the "Cost by module" table + section
  // headers. When an emitter returns MULTIPLE DesignModules that share the same
  // `module` enum (e.g. a chemical plant with three `mass_fluid_transport_process`
  // stages), each MUST carry a DISTINCT display_name — otherwise the renderer
  // prints indistinguishable rows AND the BoM audit's per-module-header Map
  // collides (Map.set overwrites the same key), dropping those modules'
  // sub-totals from Σ and false-failing B-3 (cover ≢ Σ module sub-totals,
  // exit 10). The Stage 1.7 LLM path already populates this on state; a
  // deterministic emitter that reuses a module enum should set it too. The
  // renderer falls back to humanise(module) when absent.
  display_name?: string
  module_brief: string
  overview_paragraph_en: string
  derived_parameters: Record<string, number | string>
  allowed_radicals: string[]
  applicability_confidence: 'high' | 'medium' | 'low'
  sub_modules: Array<unknown>
}

export interface AssemblerOutcome {
  ok: boolean
  design: DesignJSON | null
  error?: string
}

/** Signature every per-class emitter must implement. */
export type ClassEmitter = (
  contract: ContractInProgress,
  brief: ParsedConstraints,
  envelope: BriefEnvelope,
) => DesignJSON

/** Internal registry — populated at module-load by per-class emitters. */
const EMITTER_REGISTRY: Record<string, ClassEmitter> = {}

/**
 * Register an emitter for a class (or class/scale_tier pair).
 *
 * Key formats accepted:
 *   - 'bess'                                — matches any scale_tier
 *   - 'bess/utility_containerised'         — exact match
 *   - 'satellite_smallsat'                  — class alias
 *
 * Lookup precedence: exact 'class/scale_tier' → class alone.
 */
export function registerAssembler(key: string, fn: ClassEmitter): void {
  EMITTER_REGISTRY[key] = fn
}

/**
 * List all registered class keys (for diagnostics).
 */
export function listAssemblers(): string[] {
  return Object.keys(EMITTER_REGISTRY).sort()
}

/**
 * Assemble a DesignJSON from the (validated) Contract + envelope.
 *
 * Lookup precedence:
 *   1. envelope.class + '/' + envelope.scale_tier exact match
 *   2. envelope.class alone
 *   3. fail → caller falls back to LLM Generator path
 *
 * BESS emitter is still the only legacy lazy-import (1424-line file
 * loaded only when needed); other classes register their emitters at
 * module-load via the `emitters/` directory.
 */
export async function assembleDesign(
  contract: ContractInProgress,
  envelope: BriefEnvelope,
  brief: ParsedConstraints,
): Promise<AssemblerOutcome> {
  // 2026-05-23: universal post-emitter pass — splitDenseSubModulesByRadical
  // expands thin per-class emitters (bioreactor, h2_electrolyser, etc.)
  // that bundle 4-6 words into a single sub-module per top-level module.
  // VF/HAPS/quantum_computer already exceed the density floor and are
  // pass-through. See scripts/lib/orchestrator/submodule-splitter.ts.
  // U6 brief-scope gating (drop OPTIONAL modules the brief doesn't signal) runs
  // AFTER the density split, on every class's emitter output.
  const finalise = (design: DesignJSON): DesignJSON =>
    applyBriefScopeFilter(splitDenseSubModulesByRadical(design), brief, envelope)

  // ── 0. Holdout (Experiment A — GENERIC-EMITTER-PLAN.md §1) ──
  // EXP_A_HOLDOUT_CLASS=bess forces a KNOWN class down the GENERIC miss-fallback
  // (§4) by hiding its registered + legacy emitters, so the generic output can
  // be councilled against the hand-built golden. Comma-separated; empty = normal.
  const heldOut = (process.env.EXP_A_HOLDOUT_CLASS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(envelope.class)

  // ── 1. Try exact class/scale_tier match in registry ──
  const exactKey = `${envelope.class}/${envelope.scale_tier ?? 'default'}`
  const exactFn = heldOut ? undefined : EMITTER_REGISTRY[exactKey]
  if (exactFn) {
    try {
      const design = exactFn(contract, brief, envelope)
      return { ok: true, design: finalise(design) }
    } catch (err) {
      return { ok: false, design: null, error: `emitter ${exactKey} threw: ${(err as Error).message}` }
    }
  }

  // ── 2. Try class-alone match in registry ──
  const classFn = heldOut ? undefined : EMITTER_REGISTRY[envelope.class]
  if (classFn) {
    try {
      const design = classFn(contract, brief, envelope)
      return { ok: true, design: finalise(design) }
    } catch (err) {
      return { ok: false, design: null, error: `emitter ${envelope.class} threw: ${(err as Error).message}` }
    }
  }

  // ── 3. Legacy BESS path (lazy-import for the 1424-line file) ──
  if (!heldOut && envelope.class === 'bess' && envelope.scale_tier === 'utility_containerised') {
    try {
      const { emitBessDesign, canEmitBess } = await import('../deterministic-emitter')
      if (!canEmitBess(contract as any)) {
        return { ok: false, design: null, error: 'canEmitBess returned false for utility BESS envelope' }
      }
      const design = emitBessDesign(contract as any, brief)
      return { ok: true, design: finalise(design as unknown as DesignJSON) }
    } catch (err) {
      return { ok: false, design: null, error: `BESS emitter threw: ${(err as Error).message}` }
    }
  }

  // ── 4. Generic emitter (wall-3 miss-fallback) — GENERIC-EMITTER-PLAN.md §3 ──
  // Flag-gated (UNIVERSAL_GENERIC_EMITTER=1) so the 35 registered classes never
  // reach it. The single path that renders an UNSEEN class (or an Exp-A holdout):
  // structure from the class-reference graph + downstream gap-filler parts.
  if (process.env.UNIVERSAL_GENERIC_EMITTER === '1' || process.env.UNIVERSAL_GENERIC_EMITTER === 'true') {
    try {
      const { emitGenericDesign } = await import('./generic/generic-emitter')
      const design = await emitGenericDesign(contract, brief, envelope)
      return { ok: true, design: finalise(design) }
    } catch (err) {
      return { ok: false, design: null, error: `generic emitter threw: ${(err as Error).message}` }
    }
  }

  // ── 5. No emitter registered → chain falls back to LLM Generator ──
  return {
    ok: false,
    design: null,
    error: `no orchestrator assembler for ${envelope.class}/${envelope.scale_tier} (registered: ${listAssemblers().join(', ')})`,
  }
}
