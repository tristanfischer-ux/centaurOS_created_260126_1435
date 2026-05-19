import type { VerificationEvidenceRecord } from '../schema/types'
import type { EngineeringVerificationPlan, VerificationActivity } from './verification-plan'

export type VerificationLedgerStatus =
  | 'accepted'
  | 'rejected'
  | 'deferred'
  | 'pending'
  | 'blocked_without_evidence'
  | 'source_evidence_required'

export interface VerificationLedgerRow {
  activityId: string
  activity: string
  evidenceKind: VerificationActivity['evidenceKind']
  plannedStatus: VerificationActivity['status']
  ledgerStatus: VerificationLedgerStatus
  moduleId: string
  moduleName: string
  reviewerName?: string
  evidenceRef?: string
  evidenceNote?: string
  reviewedAt?: string
  residualAction: string
}

export interface VerificationEvidenceLedger {
  summary: {
    activities: number
    evidenceEligibleActivities: number
    sourceEvidenceActivities: number
    accepted: number
    rejected: number
    deferred: number
    pending: number
    blockedWithoutEvidence: number
    reviewCoverageRatio: number
    acceptanceRatio: number
    ignoredRecords: number
    supersededRecords: number
  }
  ignoredRecords: Array<{ activityId: string; reason: string }>
  rows: VerificationLedgerRow[]
}

export function buildVerificationEvidenceLedger(
  plan: EngineeringVerificationPlan,
  records: VerificationEvidenceRecord[] = [],
): VerificationEvidenceLedger {
  const activitiesById = new Map(plan.activities.map(activity => [activity.id, activity]))
  const ignoredRecords: VerificationEvidenceLedger['ignoredRecords'] = []
  const recordsByActivity = new Map<string, VerificationEvidenceRecord>()
  let supersededRecords = 0

  for (const record of records) {
    const activity = activitiesById.get(record.activityId)
    if (!activity) {
      ignoredRecords.push({ activityId: record.activityId, reason: 'No matching verification-plan activity.' })
      continue
    }
    if (activity.evidenceKind === 'source_evidence') {
      ignoredRecords.push({ activityId: record.activityId, reason: 'Source-evidence activities must be satisfied through sourcing intake.' })
      continue
    }
    if (activity.evidenceKind !== record.evidenceKind) {
      ignoredRecords.push({ activityId: record.activityId, reason: `Evidence kind ${record.evidenceKind} does not match activity kind ${activity.evidenceKind}.` })
      continue
    }
    const existing = recordsByActivity.get(record.activityId)
    if (existing) {
      supersededRecords += 1
      if (record.reviewedAt < existing.reviewedAt) continue
    }
    recordsByActivity.set(record.activityId, record)
  }

  const rows = plan.activities.map(activity => ledgerRow(activity, recordsByActivity.get(activity.id)))
  const evidenceEligibleActivities = rows.filter(row => row.evidenceKind !== 'source_evidence').length
  const accepted = rows.filter(row => row.ledgerStatus === 'accepted').length
  const rejected = rows.filter(row => row.ledgerStatus === 'rejected').length
  const deferred = rows.filter(row => row.ledgerStatus === 'deferred').length
  const pending = rows.filter(row => row.ledgerStatus === 'pending').length
  const blockedWithoutEvidence = rows.filter(row => row.ledgerStatus === 'blocked_without_evidence').length
  const reviewed = accepted + rejected + deferred

  return {
    summary: {
      activities: rows.length,
      evidenceEligibleActivities,
      sourceEvidenceActivities: rows.filter(row => row.ledgerStatus === 'source_evidence_required').length,
      accepted,
      rejected,
      deferred,
      pending,
      blockedWithoutEvidence,
      reviewCoverageRatio: ratio(reviewed, evidenceEligibleActivities),
      acceptanceRatio: ratio(accepted, evidenceEligibleActivities),
      ignoredRecords: ignoredRecords.length,
      supersededRecords,
    },
    ignoredRecords,
    rows,
  }
}

export function renderVerificationEvidenceLedgerCsv(ledger: VerificationEvidenceLedger): string {
  const header = [
    'activityId',
    'activity',
    'evidenceKind',
    'plannedStatus',
    'ledgerStatus',
    'moduleId',
    'moduleName',
    'reviewerName',
    'evidenceRef',
    'evidenceNote',
    'reviewedAt',
    'residualAction',
  ]
  const rows = ledger.rows.map(row => [
    row.activityId,
    row.activity,
    row.evidenceKind,
    row.plannedStatus,
    row.ledgerStatus,
    row.moduleId,
    row.moduleName,
    row.reviewerName ?? '',
    row.evidenceRef ?? '',
    row.evidenceNote ?? '',
    row.reviewedAt ?? '',
    row.residualAction,
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

function ledgerRow(activity: VerificationActivity, record: VerificationEvidenceRecord | undefined): VerificationLedgerRow {
  if (activity.evidenceKind === 'source_evidence') {
    return baseRow(activity, 'source_evidence_required', 'Use sourcing intake for supplier, manufacturer, MPN, cost and lead-time evidence.')
  }
  if (!record) {
    const status = activity.status === 'blocked' ? 'blocked_without_evidence' : 'pending'
    const action = activity.status === 'blocked'
      ? 'Resolve the plan blocker before reviewer evidence can close this activity.'
      : 'Collect reviewer evidence through the verification intake template.'
    return baseRow(activity, status, action)
  }
  if (record.verdict === 'accepted') {
    return {
      ...baseRow(activity, 'accepted', 'Accepted by reviewer; keep the evidence reference attached to the activity.'),
      ...recordFields(record),
    }
  }
  if (record.verdict === 'rejected') {
    return {
      ...baseRow(activity, 'rejected', 'Resolve reviewer rejection before treating this activity as complete.'),
      ...recordFields(record),
    }
  }
  return {
    ...baseRow(activity, 'deferred', 'Track the explicit defer decision and do not count this activity as accepted.'),
    ...recordFields(record),
  }
}

function baseRow(
  activity: VerificationActivity,
  ledgerStatus: VerificationLedgerStatus,
  residualAction: string,
): VerificationLedgerRow {
  return {
    activityId: activity.id,
    activity: activity.activity,
    evidenceKind: activity.evidenceKind,
    plannedStatus: activity.status,
    ledgerStatus,
    moduleId: activity.moduleId,
    moduleName: activity.moduleName,
    residualAction,
  }
}

function recordFields(record: VerificationEvidenceRecord): Pick<VerificationLedgerRow, 'reviewerName' | 'evidenceRef' | 'evidenceNote' | 'reviewedAt'> {
  return {
    reviewerName: record.reviewerName,
    evidenceRef: record.evidenceRef,
    evidenceNote: record.evidenceNote,
    reviewedAt: record.reviewedAt,
  }
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return 0
  return Math.round((numerator / denominator) * 100) / 100
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
