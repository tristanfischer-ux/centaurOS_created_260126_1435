/**
 * @file safe-state.ts — defensive state normalisation for PDF rendering.
 *
 * Purpose: produce a guaranteed-non-null `PipelineState` so each PDF
 * section can render without scattered `?.` chains and without crashing
 * when an upstream stage fails or returns partial data.
 *
 * This is the A3 null-safety layer. The PDF renderer imports `normaliseState`
 * at the top of `PdfRenderer` and every downstream section reads from the
 * normalised copy rather than the raw state.
 *
 * Rule: if a required collection is missing we substitute `[]`; if a required
 * object is missing we substitute a well-typed placeholder with `null`-marked
 * scalar fields so the renderer shows the literal text "—" instead of
 * crashing. We never fabricate numerical values.
 */

import type {
  PipelineState,
  Module,
  Part,
  BomLine,
  CostBreakdown,
  SpecialistReview,
  SupplierMatch,
  SourceAttribution,
  LlmAttribution,
  SectionScore,
  DimensionSheet,
  ResearchResult,
} from '../types'

/**
 * The normalised counterpart. Same shape as `PipelineState` with required
 * arrays/objects substituted for missing values. The purpose is to let
 * the renderer read fields without `?.` chains.
 */
export interface SafePipelineState extends Omit<PipelineState,
  'modules' | 'parts' | 'bomLines' | 'reviews' | 'suppliers' |
  'sourceAttributions' | 'llmAttributions' | 'sectionScores'
> {
  modules: Module[]
  parts: Part[]
  bomLines: BomLine[]
  reviews: SpecialistReview[]
  suppliers: SupplierMatch[]
  sourceAttributions: SourceAttribution[]
  llmAttributions: LlmAttribution[]
  sectionScores: SectionScore[]
  research: ResearchResult | null
  dimensionSheet: DimensionSheet | null
  costBreakdown: CostBreakdown | null
}

/**
 * Normalise a PipelineState into SafePipelineState. Missing arrays become
 * empty arrays; missing nullable objects stay `null` (renderer must handle).
 *
 * Defensive in one direction only — we NEVER produce a richer state than
 * the input. Missing scalar fields stay `undefined` and the renderer shows
 * "—" for them.
 */
export function normaliseState(state: PipelineState | null | undefined): SafePipelineState {
  if (!state) {
    // Full fallback — every collection empty, every object null.
    return {
      projectId: 'unknown',
      briefText: undefined,
      productClass: undefined,
      research: null,
      modules: [],
      dimensionSheet: null,
      parts: [],
      bomLines: [],
      costBreakdown: null,
      reviews: [],
      suppliers: [],
      proofreadFindings: null,
      sourceAttributions: [],
      llmAttributions: [],
      sectionScores: [],
    }
  }

  return {
    ...state,
    modules: Array.isArray(state.modules) ? state.modules : [],
    parts: Array.isArray(state.parts) ? state.parts : [],
    bomLines: Array.isArray(state.bomLines) ? state.bomLines : [],
    reviews: Array.isArray(state.reviews) ? state.reviews : [],
    suppliers: Array.isArray(state.suppliers) ? state.suppliers : [],
    sourceAttributions: Array.isArray(state.sourceAttributions) ? state.sourceAttributions : [],
    llmAttributions: Array.isArray(state.llmAttributions) ? state.llmAttributions : [],
    sectionScores: Array.isArray(state.sectionScores) ? state.sectionScores : [],
    research: state.research ?? null,
    dimensionSheet: state.dimensionSheet ?? null,
    costBreakdown: state.costBreakdown ?? null,
  }
}

/**
 * Safe number coercion for PDF rendering. Returns `null` when the input is
 * undefined, null, NaN, or non-finite. The renderer shows "—" for null.
 *
 * Also catches the Yoga sentinel (-8e21) which can crash @react-pdf/renderer
 * when any layout field is assigned a non-finite number. See MemPalace entry
 * "PostgREST Numeric-as-String Coercion in PDF Renderer".
 */
export function safeNumber(n: unknown): number | null {
  if (n === null || n === undefined) return null
  // Strings can slip through LLM output — try to parse.
  if (typeof n === 'string') {
    const stripped = n.replace(/,/g, '').trim()
    if (stripped === '' || stripped === '—' || stripped === '-') return null
    const parsed = parseFloat(stripped)
    return Number.isFinite(parsed) ? parsed : null
  }
  if (typeof n !== 'number') return null
  if (!Number.isFinite(n)) return null
  // Guard against Yoga sentinels (|n| > 1e20 is never a real engineering value).
  if (Math.abs(n) > 1e15) return null
  return n
}

/**
 * Safe string coercion. Returns "" for null/undefined/non-string input so
 * `Text` components never receive `undefined` (which @react-pdf renders as
 * a literal "undefined" string on some platforms).
 */
export function safeString(s: unknown): string {
  if (s === null || s === undefined) return ''
  if (typeof s === 'string') return s
  if (typeof s === 'number' || typeof s === 'boolean') return String(s)
  return ''
}

/**
 * Safe array coercion.
 */
export function safeArray<T>(a: unknown): T[] {
  return Array.isArray(a) ? (a as T[]) : []
}

/**
 * Format a value for PDF rendering. Null/undefined → "—".
 */
export function fmtOrDash(v: unknown, suffix = ''): string {
  const n = safeNumber(v)
  if (n === null) return '—'
  return `${n}${suffix}`
}

/**
 * Safe GBP formatter. Null/undefined → "—".
 */
export function fmtGbpOrDash(v: unknown): string {
  const n = safeNumber(v)
  if (n === null) return '—'
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n)
  } catch {
    return '—'
  }
}
