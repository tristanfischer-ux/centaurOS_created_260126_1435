import type {
  ProductDossier,
  SourceGrade,
  SourcingEvidenceRecord,
  SourcingModel,
} from '../schema/types'
import { admitSourcingEvidence } from './admission'
import { buildSourcingEvidencePack, type SourcingEvidencePacket } from './evidence-pack'

type AdmissibleSourceGrade = Extract<SourceGrade, 'verified' | 'priced' | 'catalogue'>

export interface SourcingEvidenceDraft {
  componentWordId: string
  description: string
  priority: 'critical' | 'candidate'
  supplierName: string
  manufacturer: string
  mpn: string
  unitCostGbp: number | null
  leadTimeWeeks: number | null
  sourceGrade: AdmissibleSourceGrade | ''
  evidence: {
    kind: 'source'
    ref: string
    quote: string
  }
  retrievedAt: string
}

export interface SourcingIntakeTemplate {
  dossierId: string
  productClass: ProductDossier['productClass']
  criticalOnly: boolean
  instructions: string[]
  drafts: SourcingEvidenceDraft[]
}

export interface SourcingIntakeDryRun {
  validDrafts: number
  invalidDrafts: number
  draftRejections: Array<{ componentWordId: string; reasons: string[] }>
  admission: SourcingModel['admission']
  admittedRecords: SourcingEvidenceRecord[]
}

export function buildSourcingIntakeTemplate(dossier: ProductDossier, criticalOnly = true): SourcingIntakeTemplate {
  const pack = buildSourcingEvidencePack(dossier)
  const packets = criticalOnly
    ? pack.criticalPackets
    : [...pack.criticalPackets, ...pack.candidatePackets]

  return {
    dossierId: dossier.id,
    productClass: dossier.productClass,
    criticalOnly,
    instructions: [
      'Fill only from supplier, manufacturer, distributor, quote, catalogue or datasheet evidence.',
      'Do not use benchmark averages, LLM estimates, class-pack defaults or unsourced model output.',
      'The intake record is only admitted when every required field validates and componentWordId matches a candidate BoM line.',
    ],
    drafts: packets.map(draftFromPacket),
  }
}

export function renderSourcingIntakeTemplateCsv(template: SourcingIntakeTemplate): string {
  const header = [
    'componentWordId',
    'description',
    'priority',
    'supplierName',
    'manufacturer',
    'mpn',
    'unitCostGbp',
    'leadTimeWeeks',
    'sourceGrade',
    'evidence.ref',
    'evidence.quote',
    'retrievedAt',
  ]
  const rows = template.drafts.map(draft => [
    draft.componentWordId,
    draft.description,
    draft.priority,
    draft.supplierName,
    draft.manufacturer,
    draft.mpn,
    draft.unitCostGbp === null ? '' : String(draft.unitCostGbp),
    draft.leadTimeWeeks === null ? '' : String(draft.leadTimeWeeks),
    draft.sourceGrade,
    draft.evidence.ref,
    draft.evidence.quote,
    draft.retrievedAt,
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

export function dryRunSourcingIntake(
  dossier: ProductDossier,
  drafts: SourcingEvidenceDraft[],
): SourcingIntakeDryRun {
  const validComponentIds = new Set(dossier.bom.lines.map(line => line.componentWordId))
  const draftRejections: Array<{ componentWordId: string; reasons: string[] }> = []
  const records: SourcingEvidenceRecord[] = []

  for (const draft of drafts) {
    const result = validateDraft(draft, validComponentIds)
    if (result.length > 0) {
      draftRejections.push({ componentWordId: draft.componentWordId, reasons: result })
      continue
    }
    records.push(recordFromDraft(draft))
  }

  const admission = admitSourcingEvidence(dossier.bom, records)
  return {
    validDrafts: records.length,
    invalidDrafts: draftRejections.length,
    draftRejections,
    admission: {
      status: admission.admitted.length === 0
        ? 'not_started'
        : admission.bom.lines.every(line => line.unitCostGbp !== null)
          ? 'complete'
          : 'partial',
      candidateLines: admission.bom.lines.length,
      admittedLines: admission.admitted.length,
      unpricedLines: admission.bom.lines.filter(line => line.unitCostGbp === null).length,
      unpricedCriticalLines: admission.bom.lines.filter(line => line.critical && line.unitCostGbp === null).length,
      rejectedRecords: admission.rejected,
    },
    admittedRecords: admission.admitted,
  }
}

function draftFromPacket(packet: SourcingEvidencePacket): SourcingEvidenceDraft {
  return {
    componentWordId: packet.componentWordId,
    description: packet.description,
    priority: packet.priority,
    supplierName: '',
    manufacturer: '',
    mpn: '',
    unitCostGbp: null,
    leadTimeWeeks: null,
    sourceGrade: 'catalogue',
    evidence: {
      kind: 'source',
      ref: '',
      quote: '',
    },
    retrievedAt: '',
  }
}

function validateDraft(draft: SourcingEvidenceDraft, validComponentIds: Set<string>): string[] {
  const reasons: string[] = []
  if (!validComponentIds.has(draft.componentWordId)) reasons.push('componentWordId does not match a candidate BoM line.')
  if (!draft.supplierName.trim()) reasons.push('supplierName is required.')
  if (!draft.manufacturer.trim()) reasons.push('manufacturer is required unless documented as an engineered assembly.')
  if (!draft.mpn.trim()) reasons.push('mpn is required unless documented as an engineered assembly.')
  if (!Number.isFinite(draft.unitCostGbp) || draft.unitCostGbp === null || draft.unitCostGbp <= 0) reasons.push('unitCostGbp must be a positive number.')
  if (draft.leadTimeWeeks !== null && (!Number.isFinite(draft.leadTimeWeeks) || draft.leadTimeWeeks < 0)) reasons.push('leadTimeWeeks must be blank or a non-negative number.')
  if (!['verified', 'priced', 'catalogue'].includes(draft.sourceGrade)) reasons.push('sourceGrade must be verified, priced, or catalogue.')
  if (draft.evidence.kind !== 'source') reasons.push('evidence.kind must be source.')
  if (!draft.evidence.ref.trim()) reasons.push('evidence.ref is required.')
  if (!draft.evidence.quote.trim()) reasons.push('evidence.quote is required.')
  if (!draft.retrievedAt.trim()) reasons.push('retrievedAt is required.')
  return reasons
}

function recordFromDraft(draft: SourcingEvidenceDraft): SourcingEvidenceRecord {
  return {
    componentWordId: draft.componentWordId,
    supplierName: draft.supplierName,
    manufacturer: draft.manufacturer,
    mpn: draft.mpn,
    unitCostGbp: draft.unitCostGbp ?? 0,
    leadTimeWeeks: draft.leadTimeWeeks ?? undefined,
    sourceGrade: draft.sourceGrade || 'catalogue',
    evidence: {
      kind: 'source',
      ref: draft.evidence.ref,
      quote: draft.evidence.quote,
    },
    retrievedAt: draft.retrievedAt,
  }
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
