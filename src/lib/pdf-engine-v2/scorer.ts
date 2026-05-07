/**
 * @file scorer.ts — Deterministic section quality scorer
 *
 * Evaluates each section of the pipeline output and assigns a score 1-10.
 * No LLM involved — pure data quality checks against the PipelineState.
 */

import type { PipelineState, SectionScore } from './types'

function score(section: string, score: number, reasons: string[], suggestions: string[]): SectionScore {
  // SCORE-002: Allow < 0 for sentinels, otherwise clamp 1-10
  return { section, score: score < 0 ? score : Math.max(1, Math.min(10, score)), reasons, suggestions }
}

function countChars(s: string | null | undefined): number {
  return (s || '').length
}

function hasContent(s: string | null | undefined, minLen = 10): boolean {
  return countChars(s) >= minLen
}

/** Score all sections and return SectionScore array */
export function scoreAllSections(state: PipelineState): SectionScore[] {
  return [
    scoreBrief(state),
    scoreRegulatory(state),
    scoreSizing(state),
    scoreModules(state),
    scoreBom(state),
    scoreCost(state),
    scoreRisks(state),
    scoreSuppliers(state),
    scoreResearch(state),
  ]
}

function scoreBrief(state: PipelineState): SectionScore {
  return score('Brief', -1, ['Deterministic scorer retired (F12) — this section is only scored when the council judges succeed'], ['Rely on the council-scorer output for this section'])
}

function scoreRegulatory(state: PipelineState): SectionScore {
  return score('Regulatory', -1, ['Deterministic scorer retired (F12) — this section is only scored when the council judges succeed'], ['Rely on the council-scorer output for this section'])
}

function scoreSizing(state: PipelineState): SectionScore {
  return score('Sizing', -1, ['Deterministic scorer retired (F12) — this section is only scored when the council judges succeed'], ['Rely on the council-scorer output for this section'])
}

function scoreModules(state: PipelineState): SectionScore {
  return score('Modules', -1, ['Deterministic scorer retired (F12) — this section is only scored when the council judges succeed'], ['Rely on the council-scorer output for this section'])
}

function scoreBom(state: PipelineState): SectionScore {
  return score('BOM', -1, ['Deterministic scorer retired (F12) — this section is only scored when the council judges succeed'], ['Rely on the council-scorer output for this section'])
}

function scoreCost(state: PipelineState): SectionScore {
  return score('Cost', -1, ['Deterministic scorer retired (F12) — this section is only scored when the council judges succeed'], ['Rely on the council-scorer output for this section'])
}

function scoreRisks(state: PipelineState): SectionScore {
  return score('Risks', -1, ['Deterministic scorer retired (F12) — this section is only scored when the council judges succeed'], ['Rely on the council-scorer output for this section'])
}

function scoreSuppliers(state: PipelineState): SectionScore {
  return score('Suppliers', -1, ['Deterministic scorer retired (F12) — this section is only scored when the council judges succeed'], ['Rely on the council-scorer output for this section'])
}

function scoreResearch(state: PipelineState): SectionScore {
  return score('Research', -1, ['Deterministic scorer retired (F12) — this section is only scored when the council judges succeed'], ['Rely on the council-scorer output for this section'])
}
