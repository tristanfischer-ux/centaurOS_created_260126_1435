/**
 * @file audience.ts — Report audience registry and stage-gating helpers.
 *
 * @description Four audience variants steer both the AI narrative (via
 * Phase 1 Opus system prompt selection) and the per-format layout choices
 * in the docx / pdf / pptx / html exporters. Each audience has a minimum
 * stage at which its content is meaningful — e.g. Supplier needs sourcing
 * work, Engineer needs diagnostics.
 *
 * @related
 * - src/lib/cad-lab/design-report-types.ts — ReportStage enum + DesignReportData
 * - src/lib/cad-lab/prompts/{investor,engineer,supplier,marketing}-outline.ts
 * - src/app/(platform)/the-forge/cad-lab/components/design-report-dialog.tsx
 */

import type { ReportStage, ReportSectionType } from './design-report-types'

export type ReportAudience = 'investor' | 'engineer' | 'supplier' | 'marketing'

export const REPORT_AUDIENCES: readonly ReportAudience[] = [
  'investor',
  'engineer',
  'supplier',
  'marketing',
] as const

export const DEFAULT_AUDIENCE: ReportAudience = 'investor'

export interface AudienceMeta {
  id: ReportAudience
  /** Short label for the picker card. */
  label: string
  /** One-line description for the picker card. */
  description: string
  /** Lucide icon name — imported lazily in the UI component. */
  iconKey: 'Briefcase' | 'Wrench' | 'Truck' | 'Megaphone'
  /** Minimum project stage at which this audience is viable. */
  minStage: ReportStage
  /** Why this audience requires that stage — shown as tooltip when disabled. */
  minStageReason: string
  /** Illustration style paired with this audience (fed to Phase 2.5). */
  preferredIllustrationStyle: 'blueprint' | 'photoreal' | 'isometric_vector' | 'photography'
}

export const AUDIENCE_META: Record<ReportAudience, AudienceMeta> = {
  investor: {
    id: 'investor',
    label: 'Investor edition',
    description: 'Narrative-led, KPI stat cards, risk and opportunity framing.',
    iconKey: 'Briefcase',
    minStage: 'concept',
    minStageReason: '',
    preferredIllustrationStyle: 'photoreal',
  },
  engineer: {
    id: 'engineer',
    label: 'Engineer edition',
    description: 'Dense spec sheets, standards references, tolerance and material grids.',
    iconKey: 'Wrench',
    minStage: 'specify',
    minStageReason: 'Engineering edition needs module diagnostics — available from Specify stage.',
    preferredIllustrationStyle: 'blueprint',
  },
  supplier: {
    id: 'supplier',
    label: 'Supplier edition',
    description: 'RFQ-ready BOM pack, process and tolerance grids, lead times.',
    iconKey: 'Truck',
    minStage: 'source',
    minStageReason: 'Supplier edition needs sourcing data (part classification, supplier matches) — available from Sourcing stage.',
    preferredIllustrationStyle: 'blueprint',
  },
  marketing: {
    id: 'marketing',
    label: 'Press asset',
    description: 'Glossy brochure, hero shots, brand voice — shareable on web and socials.',
    iconKey: 'Megaphone',
    minStage: 'concept',
    minStageReason: '',
    preferredIllustrationStyle: 'photography',
  },
}

const STAGE_ORDER: readonly ReportStage[] = [
  'concept',
  'specify',
  'source',
  'assemble',
  'cad',
  'journey',
] as const

function stageIndex(stage: ReportStage): number {
  return STAGE_ORDER.indexOf(stage)
}

/** True if the project has progressed far enough for this audience to have
 *  meaningful content. `journey` always resolves as full-stage. */
export function isAudienceViableAtStage(
  audience: ReportAudience,
  stage: ReportStage,
): boolean {
  if (stage === 'journey') return true
  return stageIndex(stage) >= stageIndex(AUDIENCE_META[audience].minStage)
}

export function isReportAudience(value: unknown): value is ReportAudience {
  return (
    value === 'investor' ||
    value === 'engineer' ||
    value === 'supplier' ||
    value === 'marketing'
  )
}

export function getAudienceMeta(audience: ReportAudience): AudienceMeta {
  return AUDIENCE_META[audience]
}

// ─── Audience-aware section ordering ─────────────────────────────────

// INTENT: Each audience wants the AI-written sections in a different
// order. Investor/marketing want narrative first and cost buried; supplier
// wants BOM + suppliers up front; engineer wants specs + standards early.
// Sections not listed for a given audience fall to the end in their
// original order so nothing gets silently dropped.
export const SECTION_ORDER_BY_AUDIENCE: Record<ReportAudience, readonly ReportSectionType[]> = {
  investor: [
    'product-overview', 'research-findings', 'module-overview',
    'module-detail', 'specifications', 'specialist-reviews',
    'engineering-standards', 'supplier-analysis', 'assembly-logistics',
    'cad-output', 'conclusions', 'cost-analysis',
  ],
  engineer: [
    'module-overview', 'specifications', 'engineering-standards',
    'module-detail', 'specialist-reviews', 'cost-analysis', 'cad-output',
    'supplier-analysis', 'part-classification', 'assembly-logistics',
    'product-overview', 'research-findings', 'conclusions',
  ],
  supplier: [
    'part-classification', 'supplier-analysis', 'specifications',
    'engineering-standards', 'cost-analysis', 'module-overview',
    'module-detail', 'assembly-logistics', 'cad-output',
    'product-overview', 'specialist-reviews', 'research-findings',
    'conclusions',
  ],
  marketing: [
    'product-overview', 'module-overview', 'module-detail',
    'research-findings', 'specialist-reviews', 'conclusions',
    'cad-output', 'assembly-logistics', 'supplier-analysis',
    'part-classification', 'specifications', 'engineering-standards',
    'cost-analysis',
  ],
}

/** Reorder AI-written sections according to the audience's priority. Stable
 *  — sections whose type is not in the priority list keep their relative
 *  order and fall to the end. */
export function reorderSectionsForAudience<T extends { sectionType: ReportSectionType }>(
  sections: readonly T[],
  audience: ReportAudience,
): T[] {
  const priority = SECTION_ORDER_BY_AUDIENCE[audience]
  const priorityIndex = new Map<ReportSectionType, number>(
    priority.map((t, i) => [t, i]),
  )
  return [...sections].sort((a, b) => {
    const ai = priorityIndex.has(a.sectionType) ? priorityIndex.get(a.sectionType)! : Number.MAX_SAFE_INTEGER
    const bi = priorityIndex.has(b.sectionType) ? priorityIndex.get(b.sectionType)! : Number.MAX_SAFE_INTEGER
    return ai - bi
  })
}
