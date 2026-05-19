import type { ArchitectureReadiness, BatchSectionScore, ProductDossier, SectionIssue, Severity } from '../schema/types'
import { buildEvidenceGapRegister, type EvidenceGapBlocker, type EvidenceGapClosurePath, type EvidenceGapRegister, type EvidenceGapRow } from './evidence-gap-register'

export interface ClosurePlanPhase {
  id: EvidenceGapClosurePath
  title: string
  sequence: number
  rowCount: number
  blockerCount: number
  majorCount: number
  minorCount: number
  blocks: EvidenceGapBlocker[]
  entryCriteria: string[]
  exitCriteria: string[]
  rationale: string
  topRows: Array<Pick<EvidenceGapRow, 'id' | 'kind' | 'priority' | 'status' | 'scope' | 'issue' | 'requiredEvidence' | 'linkedIds'>>
}

export interface ClosurePlan {
  summary: {
    phases: number
    rows: number
    blockers: number
    majors: number
    minors: number
    architectureRevisionRows: number
    sourcingIntakeRows: number
    engineeringReviewRows: number
    verificationIntakeRows: number
    scoreRepairRows: number
    nextPhase: EvidenceGapClosurePath | null
  }
  phases: ClosurePlanPhase[]
}

const PHASE_ORDER: EvidenceGapClosurePath[] = [
  'architecture_revision',
  'sourcing_intake',
  'engineering_review',
  'verification_intake',
  'score_repair',
]

export function buildClosurePlan(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  issues: SectionIssue[],
  score?: BatchSectionScore,
): ClosurePlan {
  return closurePlanFromRegister(buildEvidenceGapRegister(dossier, readiness, issues, score))
}

export function closurePlanFromRegister(register: EvidenceGapRegister): ClosurePlan {
  const phases = PHASE_ORDER
    .map((phaseId, index) => phaseFromRows(phaseId, index + 1, register.rows.filter(row => row.closurePath === phaseId)))
    .filter((phase): phase is ClosurePlanPhase => phase !== null)

  return {
    summary: {
      phases: phases.length,
      rows: register.summary.rows,
      blockers: register.summary.blockers,
      majors: register.summary.majors,
      minors: register.summary.minors,
      architectureRevisionRows: countRows(phases, 'architecture_revision'),
      sourcingIntakeRows: countRows(phases, 'sourcing_intake'),
      engineeringReviewRows: countRows(phases, 'engineering_review'),
      verificationIntakeRows: countRows(phases, 'verification_intake'),
      scoreRepairRows: countRows(phases, 'score_repair'),
      nextPhase: phases[0]?.id ?? null,
    },
    phases,
  }
}

export function renderClosurePlanCsv(plan: ClosurePlan): string {
  const header = [
    'phase',
    'sequence',
    'title',
    'rowCount',
    'blockerCount',
    'majorCount',
    'minorCount',
    'blocks',
    'entryCriteria',
    'exitCriteria',
    'rationale',
    'topRowIds',
  ]
  const rows = plan.phases.map(phase => [
    phase.id,
    String(phase.sequence),
    phase.title,
    String(phase.rowCount),
    String(phase.blockerCount),
    String(phase.majorCount),
    String(phase.minorCount),
    phase.blocks.join('; '),
    phase.entryCriteria.join(' '),
    phase.exitCriteria.join(' '),
    phase.rationale,
    phase.topRows.map(row => row.id).join('; '),
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

function phaseFromRows(phaseId: EvidenceGapClosurePath, sequence: number, rows: EvidenceGapRow[]): ClosurePlanPhase | null {
  if (rows.length === 0) return null
  return {
    id: phaseId,
    title: titleForPhase(phaseId),
    sequence,
    rowCount: rows.length,
    blockerCount: countPriority(rows, 'blocker'),
    majorCount: countPriority(rows, 'major'),
    minorCount: countPriority(rows, 'minor'),
    blocks: Array.from(new Set(rows.flatMap(row => row.blocks))),
    entryCriteria: entryCriteriaForPhase(phaseId),
    exitCriteria: exitCriteriaForPhase(phaseId),
    rationale: rationaleForPhase(phaseId),
    topRows: rows
      .slice()
      .sort(compareRows)
      .slice(0, 20)
      .map(row => ({
        id: row.id,
        kind: row.kind,
        priority: row.priority,
        status: row.status,
        scope: row.scope,
        issue: row.issue,
        requiredEvidence: row.requiredEvidence,
        linkedIds: row.linkedIds,
      })),
  }
}

function compareRows(a: EvidenceGapRow, b: EvidenceGapRow): number {
  const priorityDelta = priorityRank(a.priority) - priorityRank(b.priority)
  if (priorityDelta !== 0) return priorityDelta
  return a.id.localeCompare(b.id)
}

function priorityRank(priority: Severity): number {
  if (priority === 'blocker') return 0
  if (priority === 'major') return 1
  return 2
}

function countRows(phases: ClosurePlanPhase[], phaseId: EvidenceGapClosurePath): number {
  return phases.find(phase => phase.id === phaseId)?.rowCount ?? 0
}

function countPriority(rows: EvidenceGapRow[], priority: Severity): number {
  return rows.filter(row => row.priority === priority).length
}

function titleForPhase(phaseId: EvidenceGapClosurePath): string {
  if (phaseId === 'architecture_revision') return 'Revise Architecture'
  if (phaseId === 'sourcing_intake') return 'Admit Source-Backed BoM Evidence'
  if (phaseId === 'engineering_review') return 'Complete Engineering Review'
  if (phaseId === 'verification_intake') return 'Accept Reviewer Evidence'
  return 'Repair Remaining Section Scores'
}

function entryCriteriaForPhase(phaseId: EvidenceGapClosurePath): string[] {
  if (phaseId === 'architecture_revision') return ['Open deterministic architecture or outside-envelope calculation gaps exist.']
  if (phaseId === 'sourcing_intake') return ['Architecture is reviewable enough to identify critical component candidates.']
  if (phaseId === 'engineering_review') return ['Calculations and assumptions have named scope, formula or model basis.']
  if (phaseId === 'verification_intake') return ['Verification intake template has non-source activities ready for reviewer evidence.']
  return ['All directly closable evidence rows have been processed, but deterministic section score gaps remain.']
}

function exitCriteriaForPhase(phaseId: EvidenceGapClosurePath): string[] {
  if (phaseId === 'architecture_revision') return ['No architecture_revision evidence gaps remain.', 'Architecture readiness gate is ready for BoM review.']
  if (phaseId === 'sourcing_intake') return ['Every critical BoM line has admitted supplier, manufacturer, MPN, unit cost and source reference.', 'BoM provenance manifest has zero critical missing-source claims.']
  if (phaseId === 'engineering_review') return ['All calculation and assumption review rows are accepted, revised or explicitly deferred with reviewer rationale.']
  if (phaseId === 'verification_intake') return ['Every non-source verification activity is accepted, or explicitly deferred and removed from publication criteria.']
  return ['Every scored report section is at or above target and readiness verdict is publishable.']
}

function rationaleForPhase(phaseId: EvidenceGapClosurePath): string {
  if (phaseId === 'architecture_revision') return 'Fix structural or arithmetic impossibilities before collecting supplier quotes or reviewer signoff.'
  if (phaseId === 'sourcing_intake') return 'Critical BoM costs, suppliers, manufacturers and MPNs must be source-backed before cost claims are credible.'
  if (phaseId === 'engineering_review') return 'Deterministic arithmetic can expose claims, but engineering judgment must review envelopes, assumptions and operating cases.'
  if (phaseId === 'verification_intake') return 'Reviewer acceptance is tracked separately from deterministic scoring and must close before publication.'
  return 'After evidence intake, rerun scoring to remove residual deterministic section blockers.'
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
