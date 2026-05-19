import type { ArchitectureReadiness, PipelineStageTrace, ProductDossier, SectionIssue, Severity } from '../schema/types'
import type { DepthBenchmarkModel } from './depth-benchmark'
import { buildArchitectureFreezeGate, type ArchitectureFreezeArea, type ArchitectureFreezeGate, type ArchitectureFreezeGateRow } from './architecture-freeze-gate'

export type ArchitectureFreezeClosurePath =
  | 'architecture_revision'
  | 'sourcing_intake'
  | 'engineering_review'
  | 'verification_intake'

export interface ArchitectureFreezeClosureRow {
  id: string
  sequence: number
  area: ArchitectureFreezeArea
  closurePath: ArchitectureFreezeClosurePath
  priority: Severity
  status: 'ready_for_intake' | 'blocked'
  issue: string
  requiredEvidence: string
  acceptanceCriteria: string[]
  inputArtifacts: string[]
  blockedBy: string[]
  exitVerdict: string
}

export interface ArchitectureFreezeClosurePlan {
  summary: {
    rows: number
    readyRows: number
    blockedRows: number
    architectureRevisionRows: number
    sourcingIntakeRows: number
    engineeringReviewRows: number
    verificationIntakeRows: number
    nextRowId: string | null
    freezeVerdict: string
    structurallyReadyForSourcing: boolean
    independentReviewAccepted: boolean
  }
  rows: ArchitectureFreezeClosureRow[]
}

export function buildArchitectureFreezeClosurePlan(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  stageTrace: PipelineStageTrace[],
  issues: SectionIssue[],
  depthBenchmark?: DepthBenchmarkModel,
): ArchitectureFreezeClosurePlan {
  return architectureFreezeClosurePlanFromGate(buildArchitectureFreezeGate(dossier, readiness, stageTrace, issues, depthBenchmark))
}

export function architectureFreezeClosurePlanFromGate(gate: ArchitectureFreezeGate): ArchitectureFreezeClosurePlan {
  const rows = gate.rows
    .filter(row => row.verdict !== 'pass')
    .map((row, index) => closureRow(row, gate, index + 1))

  return {
    summary: {
      rows: rows.length,
      readyRows: rows.filter(row => row.status === 'ready_for_intake').length,
      blockedRows: rows.filter(row => row.status === 'blocked').length,
      architectureRevisionRows: countPath(rows, 'architecture_revision'),
      sourcingIntakeRows: countPath(rows, 'sourcing_intake'),
      engineeringReviewRows: countPath(rows, 'engineering_review'),
      verificationIntakeRows: countPath(rows, 'verification_intake'),
      nextRowId: rows.find(row => row.status === 'ready_for_intake')?.id ?? rows[0]?.id ?? null,
      freezeVerdict: gate.verdict,
      structurallyReadyForSourcing: gate.summary.structurallyReadyForSourcing,
      independentReviewAccepted: gate.summary.independentReviewAccepted,
    },
    rows,
  }
}

export function renderArchitectureFreezeClosurePlanCsv(plan: ArchitectureFreezeClosurePlan): string {
  const header = [
    'id',
    'sequence',
    'area',
    'closurePath',
    'priority',
    'status',
    'issue',
    'requiredEvidence',
    'acceptanceCriteria',
    'inputArtifacts',
    'blockedBy',
    'exitVerdict',
  ]
  const rows = plan.rows.map(row => [
    row.id,
    String(row.sequence),
    row.area,
    row.closurePath,
    row.priority,
    row.status,
    row.issue,
    row.requiredEvidence,
    row.acceptanceCriteria.join('; '),
    row.inputArtifacts.join('; '),
    row.blockedBy.join('; '),
    row.exitVerdict,
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

function closureRow(
  row: ArchitectureFreezeGateRow,
  gate: ArchitectureFreezeGate,
  sequence: number,
): ArchitectureFreezeClosureRow {
  const closurePath = closurePathFor(row)
  return {
    id: `freeze-close:${sequence}:${row.area}`,
    sequence,
    area: row.area,
    closurePath,
    priority: priorityFor(row),
    status: row.verdict === 'blocked' ? 'blocked' : 'ready_for_intake',
    issue: row.signal,
    requiredEvidence: row.requiredAction,
    acceptanceCriteria: acceptanceCriteriaFor(row.area, closurePath),
    inputArtifacts: inputArtifactsFor(row.area, closurePath),
    blockedBy: row.blockers,
    exitVerdict: exitVerdictFor(row.area, gate),
  }
}

function closurePathFor(row: ArchitectureFreezeGateRow): ArchitectureFreezeClosurePath {
  if (row.area === 'admission_and_lineage') return 'architecture_revision'
  if (row.area === 'sourcing_boundary') return 'sourcing_intake'
  if (row.area === 'interface_contracts') return row.verdict === 'blocked' ? 'architecture_revision' : 'verification_intake'
  if (row.area === 'requirement_coverage') return row.verdict === 'blocked' ? 'architecture_revision' : 'verification_intake'
  if (row.area === 'module_structure') {
    if (row.verdict === 'blocked') return 'architecture_revision'
    return row.requiredAction.toLowerCase().includes('critical sourcing') ? 'sourcing_intake' : 'engineering_review'
  }
  return 'engineering_review'
}

function priorityFor(row: ArchitectureFreezeGateRow): Severity {
  if (row.verdict === 'blocked') return 'blocker'
  if (row.area === 'module_structure' || row.area === 'engineering_review_state') return 'major'
  return 'minor'
}

function acceptanceCriteriaFor(area: ArchitectureFreezeArea, closurePath: ArchitectureFreezeClosurePath): string[] {
  if (area === 'admission_and_lineage') return [
    'Architecture admission verdict is architecture_generation_admitted.',
    'Stage integrity verdict is stage_trace_accepted.',
    'Scratch lineage verdict is scratch_lineage_clean.',
  ]
  if (area === 'module_structure') return [
    'Module engineering verdict is module_engineering_ready.',
    'No module has blocked allocation or unresolved critical sourcing blockers.',
    'Every module review question is accepted, revised or explicitly deferred.',
  ]
  if (area === 'interface_contracts') return [
    'Interface verification verdict is accepted_interfaces.',
    'Every required interface has endpoint carriers and accepted reviewer evidence.',
  ]
  if (area === 'requirement_coverage') return [
    'Requirement coverage verdict is accepted_evidence.',
    'Every parsed requirement has architecture links and accepted verification evidence.',
  ]
  if (area === 'engineering_review_state') return [
    'Pre-BoM engineering verdict is engineering_accepted.',
    'Calculations, assumptions and verification activities are accepted or explicitly deferred.',
  ]
  if (closurePath === 'sourcing_intake') return [
    'BoM provenance manifest has zero provenance violations.',
    'Supplier, manufacturer, MPN, lead time and cost claims come only from admitted source evidence.',
  ]
  return ['Architecture freeze gate row changes to pass on the next run.']
}

function inputArtifactsFor(area: ArchitectureFreezeArea, closurePath: ArchitectureFreezeClosurePath): string[] {
  if (area === 'admission_and_lineage') return [
    '*.architecture-admission-gate.csv',
    '*.stage-integrity-gate.csv',
    '*.scratch-lineage-gate.csv',
  ]
  if (area === 'module_structure') return [
    '*.module-engineering-gate.csv',
    '*.component-allocation-gate.csv',
    '*.engineering-review-pack.csv',
    '*.sourcing-intake-template.csv',
  ]
  if (area === 'interface_contracts') return [
    '*.interface-contracts.json',
    '*.interface-verification-gate.csv',
    '*.verification-intake-template.csv',
  ]
  if (area === 'requirement_coverage') return [
    '*.requirement-coverage-gate.csv',
    '*.engineering-assurance-matrix.csv',
    '*.verification-intake-template.csv',
  ]
  if (area === 'engineering_review_state') return [
    '*.pre-bom-engineering-gate.csv',
    '*.engineering-calculations.csv',
    '*.engineering-assumptions.csv',
    '*.verification-plan.csv',
  ]
  if (closurePath === 'sourcing_intake') return [
    '*.sourcing-intake-template.csv',
    '*.bom-provenance-manifest.csv',
    '*.source-reference-quality-gate.csv',
  ]
  return ['*.architecture-freeze-gate.csv']
}

function exitVerdictFor(area: ArchitectureFreezeArea, gate: ArchitectureFreezeGate): string {
  if (area === 'admission_and_lineage') return 'architecture_generation_admitted + stage_trace_accepted + scratch_lineage_clean'
  if (area === 'module_structure') return 'module_engineering_ready'
  if (area === 'interface_contracts') return 'accepted_interfaces'
  if (area === 'requirement_coverage') return 'accepted_evidence'
  if (area === 'engineering_review_state') return 'engineering_accepted'
  if (area === 'sourcing_boundary') return 'zero provenance violations'
  return gate.verdict
}

function countPath(rows: ArchitectureFreezeClosureRow[], path: ArchitectureFreezeClosurePath): number {
  return rows.filter(row => row.closurePath === path).length
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
