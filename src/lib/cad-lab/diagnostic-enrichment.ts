/**
 * @file diagnostic-enrichment.ts — Types for AI-generated diagnostic reasoning.
 *
 * @description Parallel sidecar to DiagnosticAnswers. Carries AI reasoning
 * for each diagnostic field (why THIS option was selected) plus ranked
 * alternatives. Travels on a separate path to avoid cascading type changes
 * across the 31+ files that consume DiagnosticAnswers.
 */

/** Reasoning + alternatives for a single diagnostic field */
export interface FieldEnrichment {
  /** Short AI-generated reason why this option was selected (≤20 words) */
  reason: string
  /** Ranked alternative choices with reasons, best first */
  alternatives: Array<{ value: string; reason: string }>
}

/** Enrichment for all fields in one module (keyed by questionId) */
export type ModuleEnrichment = Record<string, FieldEnrichment>

/** Enrichment for all modules (keyed by moduleId → questionId → enrichment) */
export type DiagnosticEnrichment = Record<string, ModuleEnrichment>
