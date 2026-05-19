import type {
  EngineeringVerificationPlan,
  VerificationActivity,
  VerificationEvidenceKind,
} from './verification-plan'
import type {
  VerificationEvidenceRecord,
  VerificationEvidenceVerdict,
} from '../schema/types'

export type { VerificationEvidenceRecord, VerificationEvidenceVerdict } from '../schema/types'

export interface VerificationEvidenceDraft {
  activityId: string
  activity: string
  evidenceKind: VerificationEvidenceKind | ''
  reviewerName: string
  verdict: VerificationEvidenceVerdict | ''
  evidenceRef: string
  evidenceNote: string
  reviewedAt: string
}

export interface VerificationIntakeTemplate {
  includeSourceEvidence: boolean
  instructions: string[]
  drafts: VerificationEvidenceDraft[]
}

export interface VerificationIntakeDryRun {
  validDrafts: number
  invalidDrafts: number
  accepted: number
  rejected: number
  deferred: number
  draftRejections: Array<{ activityId: string; reasons: string[] }>
  admittedRecords: VerificationEvidenceRecord[]
}

export function buildVerificationIntakeTemplate(
  plan: EngineeringVerificationPlan,
  includeSourceEvidence = false,
): VerificationIntakeTemplate {
  const activities = includeSourceEvidence
    ? plan.activities
    : plan.activities.filter(activity => activity.evidenceKind !== 'source_evidence')
  return {
    includeSourceEvidence,
    instructions: [
      'Use this intake for engineering design-review, calculation, interface-review and compliance evidence only.',
      'Do not admit BoM supplier, manufacturer, MPN, unit-cost or lead-time claims through this intake; use the sourcing intake instead.',
      'Every admitted record must name the reviewer, verdict, evidence reference, evidence note and review timestamp.',
    ],
    drafts: activities.map(draftFromActivity),
  }
}

export function dryRunVerificationIntake(
  plan: EngineeringVerificationPlan,
  drafts: VerificationEvidenceDraft[],
): VerificationIntakeDryRun {
  const activitiesById = new Map(plan.activities.map(activity => [activity.id, activity]))
  const draftRejections: VerificationIntakeDryRun['draftRejections'] = []
  const admittedRecords: VerificationEvidenceRecord[] = []

  for (const draft of drafts) {
    const activity = activitiesById.get(draft.activityId)
    const reasons = validateDraft(draft, activity)
    if (reasons.length > 0 || !activity || !isAdmissibleEvidenceKind(draft.evidenceKind) || !isVerdict(draft.verdict)) {
      draftRejections.push({ activityId: draft.activityId, reasons })
      continue
    }
    admittedRecords.push({
      activityId: draft.activityId,
      evidenceKind: draft.evidenceKind,
      reviewerName: draft.reviewerName,
      verdict: draft.verdict,
      evidenceRef: draft.evidenceRef,
      evidenceNote: draft.evidenceNote,
      reviewedAt: draft.reviewedAt,
    })
  }

  return {
    validDrafts: admittedRecords.length,
    invalidDrafts: draftRejections.length,
    accepted: admittedRecords.filter(record => record.verdict === 'accepted').length,
    rejected: admittedRecords.filter(record => record.verdict === 'rejected').length,
    deferred: admittedRecords.filter(record => record.verdict === 'deferred').length,
    draftRejections,
    admittedRecords,
  }
}

export function renderEngineeringVerificationPlanCsv(plan: EngineeringVerificationPlan): string {
  const header = [
    'activityId',
    'activity',
    'status',
    'evidenceKind',
    'moduleId',
    'moduleName',
    'requirementIds',
    'sanityCheckIds',
    'interfaceIds',
    'componentWordIds',
    'acceptanceCriteria',
    'blockers',
  ]
  const rows = plan.activities.map(activity => [
    activity.id,
    activity.activity,
    activity.status,
    activity.evidenceKind,
    activity.moduleId,
    activity.moduleName,
    activity.requirementIds.join('; '),
    activity.sanityCheckIds.join('; '),
    activity.interfaceIds.join('; '),
    activity.componentWordIds.join('; '),
    activity.acceptanceCriteria.join(' '),
    activity.blockers.join(' '),
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

export function renderVerificationIntakeTemplateCsv(template: VerificationIntakeTemplate): string {
  const header = [
    'activityId',
    'activity',
    'evidenceKind',
    'reviewerName',
    'verdict',
    'evidenceRef',
    'evidenceNote',
    'reviewedAt',
  ]
  const rows = template.drafts.map(draft => [
    draft.activityId,
    draft.activity,
    draft.evidenceKind,
    draft.reviewerName,
    draft.verdict,
    draft.evidenceRef,
    draft.evidenceNote,
    draft.reviewedAt,
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

function draftFromActivity(activity: VerificationActivity): VerificationEvidenceDraft {
  return {
    activityId: activity.id,
    activity: activity.activity,
    evidenceKind: activity.evidenceKind,
    reviewerName: '',
    verdict: '',
    evidenceRef: '',
    evidenceNote: '',
    reviewedAt: '',
  }
}

function validateDraft(draft: VerificationEvidenceDraft, activity: VerificationActivity | undefined): string[] {
  const reasons: string[] = []
  if (!activity) reasons.push('activityId does not match a verification-plan activity.')
  if (activity && draft.evidenceKind !== activity.evidenceKind) reasons.push('evidenceKind must match the verification-plan activity.')
  if (draft.evidenceKind === 'source_evidence') reasons.push('source_evidence must be admitted through sourcing intake, not verification intake.')
  if (!draft.reviewerName.trim()) reasons.push('reviewerName is required.')
  if (!['accepted', 'rejected', 'deferred'].includes(draft.verdict)) reasons.push('verdict must be accepted, rejected, or deferred.')
  if (!draft.evidenceRef.trim()) reasons.push('evidenceRef is required.')
  if (!draft.evidenceNote.trim()) reasons.push('evidenceNote is required.')
  if (!draft.reviewedAt.trim()) reasons.push('reviewedAt is required.')
  return reasons
}

function isAdmissibleEvidenceKind(value: VerificationEvidenceDraft['evidenceKind']): value is VerificationEvidenceRecord['evidenceKind'] {
  return ['design_review', 'calculation', 'interface_review', 'compliance_review'].includes(value)
}

function isVerdict(value: VerificationEvidenceDraft['verdict']): value is VerificationEvidenceVerdict {
  return ['accepted', 'rejected', 'deferred'].includes(value)
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
