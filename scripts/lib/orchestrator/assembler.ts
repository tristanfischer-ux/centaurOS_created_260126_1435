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
  const finalise = (design: DesignJSON): DesignJSON => splitDenseSubModulesByRadical(design)

  // ── 1. Try exact class/scale_tier match in registry ──
  const exactKey = `${envelope.class}/${envelope.scale_tier ?? 'default'}`
  const exactFn = EMITTER_REGISTRY[exactKey]
  if (exactFn) {
    try {
      const design = exactFn(contract, brief, envelope)
      return { ok: true, design: finalise(design) }
    } catch (err) {
      return { ok: false, design: null, error: `emitter ${exactKey} threw: ${(err as Error).message}` }
    }
  }

  // ── 2. Try class-alone match in registry ──
  const classFn = EMITTER_REGISTRY[envelope.class]
  if (classFn) {
    try {
      const design = classFn(contract, brief, envelope)
      return { ok: true, design: finalise(design) }
    } catch (err) {
      return { ok: false, design: null, error: `emitter ${envelope.class} threw: ${(err as Error).message}` }
    }
  }

  // ── 3. Legacy BESS path (lazy-import for the 1424-line file) ──
  if (envelope.class === 'bess' && envelope.scale_tier === 'utility_containerised') {
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

  // ── 4. No emitter registered → chain falls back to LLM Generator ──
  return {
    ok: false,
    design: null,
    error: `no orchestrator assembler for ${envelope.class}/${envelope.scale_tier} (registered: ${listAssemblers().join(', ')})`,
  }
}
