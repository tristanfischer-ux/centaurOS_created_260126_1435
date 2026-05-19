import type { ArchitectureReadiness, PipelineStageTrace, ProductDossier } from '../schema/types'
import { buildSourcingIntakeTemplate } from '../sourcing/intake'
import { buildSourcingWorklist } from '../sourcing/worklist'
import { buildBomProvenanceManifest } from '../sourcing/provenance-manifest'
import { buildArchitectureAdmissionGate } from './architecture-admission-gate'
import { buildComponentCandidateGate } from './component-candidate-gate'

export type SourcingAuthorizationVerdict =
  | 'sourcing_authorized'
  | 'sourcing_authorization_review_required'
  | 'sourcing_authorization_blocked'

export type SourcingAuthorizationArea =
  | 'architecture_authorization'
  | 'component_candidate_authorization'
  | 'critical_intake_scope'
  | 'full_worklist_scope'
  | 'evidence_admission_boundary'
  | 'provenance_boundary'

export type SourcingAuthorizationAreaVerdict = 'pass' | 'review' | 'blocked'

export interface SourcingAuthorizationGateRow {
  area: SourcingAuthorizationArea
  verdict: SourcingAuthorizationAreaVerdict
  signal: string
  passRatio: number
  blockers: string[]
  requiredAction: string
}

export interface SourcingAuthorizationGate {
  verdict: SourcingAuthorizationVerdict
  summary: {
    rows: number
    passRows: number
    reviewRows: number
    blockedRows: number
    passRatio: number
    architectureAdmissionVerdict: string
    componentCandidateVerdict: string
    criticalUnpricedRows: number
    candidateUnpricedRows: number
    criticalIntakeRows: number
    fullIntakeRows: number
    admittedSourcingEvidenceRows: number
    rejectedSourcingEvidenceRows: number
    provenanceViolations: number
    sourcingAuthorized: boolean
    nextAction: string | null
  }
  rows: SourcingAuthorizationGateRow[]
  blockers: string[]
  nextActions: string[]
}

export function buildSourcingAuthorizationGate(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  stageTrace: PipelineStageTrace[],
): SourcingAuthorizationGate {
  const architectureAdmission = buildArchitectureAdmissionGate(dossier, readiness, stageTrace)
  const componentCandidates = buildComponentCandidateGate(dossier)
  const worklist = buildSourcingWorklist(dossier)
  const criticalTemplate = buildSourcingIntakeTemplate(dossier, true)
  const fullTemplate = buildSourcingIntakeTemplate(dossier, false)
  const provenance = buildBomProvenanceManifest(dossier)
  const unpricedRows = worklist.criticalUnpriced.length + worklist.candidateUnpriced.length
  const provenanceViolations = provenance.rows.filter(row => row.status === 'provenance_violation')

  const rows: SourcingAuthorizationGateRow[] = [
    {
      area: 'architecture_authorization',
      verdict: architectureAdmission.summary.architectureCanProceedToBom
        ? 'pass'
        : architectureAdmission.summary.architectureCanBeUsedForReview ? 'review' : 'blocked',
      signal: `${architectureAdmission.verdict}; review ${architectureAdmission.summary.architectureCanBeUsedForReview ? 'yes' : 'no'}, BoM ${architectureAdmission.summary.architectureCanProceedToBom ? 'yes' : 'no'}.`,
      passRatio: architectureAdmission.summary.architectureCanProceedToBom ? 1 : architectureAdmission.summary.architectureCanBeUsedForReview ? 0.5 : 0,
      blockers: architectureAdmission.summary.architectureCanProceedToBom ? [] : architectureAdmission.blockers,
      requiredAction: architectureAdmission.summary.architectureCanProceedToBom
        ? 'Architecture admission permits evidence-gated sourcing work.'
        : architectureAdmission.summary.architectureCanBeUsedForReview
          ? 'Keep sourcing as review-only until architecture admission is fully cleared.'
          : 'Do not start sourcing until architecture admission blockers are resolved.',
    },
    {
      area: 'component_candidate_authorization',
      verdict: componentCandidates.summary.readyForSourcing
        ? 'pass'
        : componentCandidates.verdict === 'component_candidates_review_required' ? 'review' : 'blocked',
      signal: `${componentCandidates.verdict}; ${componentCandidates.summary.bomLines} candidate line(s), ${componentCandidates.summary.candidateWorklistRows} sourcing-worklist row(s), ${componentCandidates.summary.provenanceViolations} provenance violation(s).`,
      passRatio: componentCandidates.summary.passRatio,
      blockers: componentCandidates.summary.readyForSourcing ? [] : componentCandidates.blockers,
      requiredAction: componentCandidates.summary.readyForSourcing
        ? 'Component candidates are concrete enough for sourcing intake.'
        : componentCandidates.verdict === 'component_candidates_review_required'
          ? 'Resolve candidate review rows before admitting sourcing evidence.'
          : 'Repair component candidates before sourcing starts.',
    },
    {
      area: 'critical_intake_scope',
      verdict: criticalTemplate.drafts.length === worklist.criticalUnpriced.length ? 'pass' : 'blocked',
      signal: `${criticalTemplate.drafts.length}/${worklist.criticalUnpriced.length} critical unpriced line(s) appear in the critical sourcing intake template.`,
      passRatio: ratio(criticalTemplate.drafts.length, worklist.criticalUnpriced.length),
      blockers: criticalTemplate.drafts.length === worklist.criticalUnpriced.length
        ? []
        : ['Critical sourcing intake template does not cover every critical unpriced line.'],
      requiredAction: criticalTemplate.drafts.length === worklist.criticalUnpriced.length
        ? 'Critical sourcing intake scope is complete.'
        : 'Regenerate critical sourcing intake templates before evidence collection.',
    },
    {
      area: 'full_worklist_scope',
      verdict: fullTemplate.drafts.length === unpricedRows ? 'pass' : 'blocked',
      signal: `${fullTemplate.drafts.length}/${unpricedRows} total unpriced line(s) appear in the full sourcing intake template.`,
      passRatio: ratio(fullTemplate.drafts.length, unpricedRows),
      blockers: fullTemplate.drafts.length === unpricedRows
        ? []
        : ['Full sourcing intake template does not cover every unpriced line.'],
      requiredAction: fullTemplate.drafts.length === unpricedRows
        ? 'Full sourcing intake scope matches the unpriced worklist.'
        : 'Regenerate full sourcing intake templates before broad sourcing work.',
    },
    {
      area: 'evidence_admission_boundary',
      verdict: dossier.sourcing.admission.rejectedRecords.length === 0 ? 'pass' : 'review',
      signal: `${dossier.sources.sourcingEvidence.length} admitted source evidence row(s), ${dossier.sourcing.admission.rejectedRecords.length} rejected source evidence row(s).`,
      passRatio: ratio(dossier.sources.sourcingEvidence.length, dossier.sources.sourcingEvidence.length + dossier.sourcing.admission.rejectedRecords.length),
      blockers: dossier.sourcing.admission.rejectedRecords.map(row => `${row.componentWordId}: ${row.reason}`),
      requiredAction: dossier.sourcing.admission.rejectedRecords.length === 0
        ? 'No rejected sourcing evidence is waiting for repair.'
        : 'Repair or discard rejected source evidence before treating sourcing intake as clean.',
    },
    {
      area: 'provenance_boundary',
      verdict: provenanceViolations.length === 0 ? 'pass' : 'blocked',
      signal: `${provenance.summary.sourceBackedClaims} source-backed BoM claim(s), ${provenanceViolations.length} provenance violation(s).`,
      passRatio: provenanceViolations.length === 0 ? 1 : 0,
      blockers: provenanceViolations.slice(0, 12).map(row => `${row.lineId}/${row.field}: ${row.nextAction}`),
      requiredAction: provenanceViolations.length === 0
        ? 'Supplier, manufacturer, MPN, lead-time and cost fields remain behind admitted evidence.'
        : 'Remove unprovenanced sourcing claims before authorizing sourcing or BoM admission.',
    },
  ]

  const blockedRows = rows.filter(row => row.verdict === 'blocked')
  const reviewRows = rows.filter(row => row.verdict === 'review')
  const verdict: SourcingAuthorizationVerdict = blockedRows.length > 0
    ? 'sourcing_authorization_blocked'
    : reviewRows.length > 0 ? 'sourcing_authorization_review_required' : 'sourcing_authorized'

  return {
    verdict,
    summary: {
      rows: rows.length,
      passRows: rows.filter(row => row.verdict === 'pass').length,
      reviewRows: reviewRows.length,
      blockedRows: blockedRows.length,
      passRatio: ratio(rows.filter(row => row.verdict === 'pass').length, rows.length),
      architectureAdmissionVerdict: architectureAdmission.verdict,
      componentCandidateVerdict: componentCandidates.verdict,
      criticalUnpricedRows: worklist.criticalUnpriced.length,
      candidateUnpricedRows: worklist.candidateUnpriced.length,
      criticalIntakeRows: criticalTemplate.drafts.length,
      fullIntakeRows: fullTemplate.drafts.length,
      admittedSourcingEvidenceRows: dossier.sources.sourcingEvidence.length,
      rejectedSourcingEvidenceRows: dossier.sourcing.admission.rejectedRecords.length,
      provenanceViolations: provenanceViolations.length,
      sourcingAuthorized: verdict === 'sourcing_authorized',
      nextAction: rows.find(row => row.verdict === 'blocked')?.requiredAction ?? rows.find(row => row.verdict === 'review')?.requiredAction ?? null,
    },
    rows,
    blockers: blockedRows.flatMap(row => row.blockers.length > 0 ? row.blockers : [`${row.area}: ${row.signal}`]),
    nextActions: Array.from(new Set(rows.filter(row => row.verdict !== 'pass').map(row => row.requiredAction))),
  }
}

export function renderSourcingAuthorizationGateCsv(gate: SourcingAuthorizationGate): string {
  const header = [
    'area',
    'verdict',
    'signal',
    'passRatio',
    'blockers',
    'requiredAction',
  ]
  const rows = gate.rows.map(row => [
    row.area,
    row.verdict,
    row.signal,
    String(row.passRatio),
    row.blockers.join(' '),
    row.requiredAction,
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return 1
  return Math.round((numerator / denominator) * 100) / 100
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
