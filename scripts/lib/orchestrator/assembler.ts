/**
 * scripts/lib/orchestrator/assembler.ts
 *
 * DESIGN ASSEMBLER — mechanical instantiation of a DesignJSON from a
 * completed Contract.
 *
 * For Phase 1, this delegates to the existing hand-coded BESS template
 * in `scripts/lib/deterministic-emitter.ts` for the BESS-utility-
 * containerised envelope. Phase 4 will replace the per-class hand-
 * coded templates with parametric anchor schemas driven by the
 * Contract + class-anchor data.
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

/**
 * Assemble a DesignJSON from the (validated) Contract + envelope.
 *
 * Phase 1: delegates to the hand-coded BESS emitter for the BESS-
 * utility-containerised envelope. Other envelopes return null and
 * the chain falls back to the LLM Generator path.
 */
export async function assembleDesign(
  contract: ContractInProgress,
  envelope: BriefEnvelope,
  brief: ParsedConstraints,
): Promise<AssemblerOutcome> {
  if (envelope.class === 'bess' && envelope.scale_tier === 'utility_containerised') {
    try {
      // Lazy import to avoid loading the 1424-line file unless needed.
      const { emitBessDesign, canEmitBess } = await import('../deterministic-emitter')
      if (!canEmitBess(contract as any)) {
        return { ok: false, design: null, error: 'canEmitBess returned false for utility BESS envelope' }
      }
      const design = emitBessDesign(contract as any, brief)
      return { ok: true, design: design as unknown as DesignJSON }
    } catch (err) {
      return { ok: false, design: null, error: `BESS emitter threw: ${(err as Error).message}` }
    }
  }

  // Other envelopes: not yet implemented under the orchestrator.
  // Caller should fall back to the LLM Generator path.
  return { ok: false, design: null, error: `no orchestrator assembler for ${envelope.class}/${envelope.scale_tier}` }
}
