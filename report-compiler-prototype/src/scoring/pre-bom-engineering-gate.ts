import { buildEngineeringAssumptionLedger } from '../architecture/engineering-assumptions'
import { buildEngineeringCalculationLedger } from '../architecture/engineering-calculations'
import type { ArchitectureReadiness, ProductDossier, SectionIssue } from '../schema/types'
import { buildComponentAllocationGate } from './component-allocation-gate'
import { buildInterfaceVerificationGate } from './interface-verification-gate'
import { buildRequirementCoverageGate } from './requirement-coverage-gate'

export type PreBomEngineeringVerdict =
  | 'engineering_accepted'
  | 'engineering_review_ready'
  | 'engineering_review_blocked'
  | 'no_architecture'

export type PreBomEngineeringArea =
  | 'architecture_readiness'
  | 'component_allocation'
  | 'interface_verification'
  | 'requirement_coverage'
  | 'calculation_envelope'
  | 'engineering_assumptions'

export type PreBomEngineeringAreaVerdict = 'pass' | 'review' | 'blocked'

export interface PreBomEngineeringGateRow {
  area: PreBomEngineeringArea
  verdict: PreBomEngineeringAreaVerdict
  signal: string
  passRatio: number
  blockers: string[]
  requiredAction: string
}

export interface PreBomEngineeringGate {
  verdict: PreBomEngineeringVerdict
  summary: {
    rows: number
    passRows: number
    reviewRows: number
    blockedRows: number
    passRatio: number
    modules: number
    subModules: number
    componentWords: number
    componentAllocationVerdict: string
    interfaceVerificationVerdict: string
    requirementCoverageVerdict: string
    calculationRows: number
    calculationsWithinEnvelope: number
    calculationsNeedingReview: number
    calculationBlockers: number
    assumptionRows: number
    assumptionsNeedingReview: number
    assumptionArchitectureBlockers: number
    assumptionBomBlockers: number
  }
  rows: PreBomEngineeringGateRow[]
  blockers: string[]
  nextActions: string[]
}

export function buildPreBomEngineeringGate(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  issues: SectionIssue[],
): PreBomEngineeringGate {
  const componentAllocation = buildComponentAllocationGate(dossier)
  const interfaceVerification = buildInterfaceVerificationGate(dossier, readiness, issues)
  const requirementCoverage = buildRequirementCoverageGate(dossier, readiness, issues)
  const calculations = buildEngineeringCalculationLedger(dossier)
  const assumptions = buildEngineeringAssumptionLedger(dossier, readiness)

  const calculationBlockers = calculations.summary.blocked + calculations.summary.outsideEnvelope
  const assumptionReviewRows = assumptions.summary.reviewRequired + assumptions.summary.sourceRequired

  const rows: PreBomEngineeringGateRow[] = [
    {
      area: 'architecture_readiness',
      verdict: readiness.readyForBom ? 'pass' : 'blocked',
      signal: readiness.readyForBom
        ? `${readiness.moduleCount} modules, ${readiness.subModuleCount} submodules and ${readiness.componentWordCount} component words pass architecture readiness.`
        : `${readiness.blockingIssues.length} architecture readiness blocker(s) remain.`,
      passRatio: readiness.readyForBom ? 1 : 0,
      blockers: readiness.blockingIssues.map(issue => `${issue.code}: ${issue.message}`),
      requiredAction: readiness.readyForBom
        ? 'Architecture is structurally ready for engineering review.'
        : 'Resolve architecture readiness blockers before BoM or engineering-review promotion.',
    },
    {
      area: 'component_allocation',
      verdict: componentAllocation.verdict === 'allocation_ready'
        ? 'pass'
        : componentAllocation.verdict === 'allocation_review_required' ? 'review' : 'blocked',
      signal: `${componentAllocation.summary.readySubModules}/${componentAllocation.summary.subModules} submodules ready; ${componentAllocation.summary.allocatedCriticalParts}/${componentAllocation.summary.requiredCriticalParts} critical parts allocated; ${componentAllocation.summary.duplicateComponentGroups} duplicate component groups.`,
      passRatio: componentAllocation.summary.allocationRatio,
      blockers: componentAllocation.blockers,
      requiredAction: componentAllocation.verdict === 'allocation_ready'
        ? 'Component candidates are allocated well enough for engineering review.'
        : componentAllocation.nextActions.join(' ') || 'Resolve component allocation issues.',
    },
    {
      area: 'interface_verification',
      verdict: interfaceVerification.verdict === 'interface_blocked' || interfaceVerification.verdict === 'no_required_interfaces'
        ? 'blocked'
        : interfaceVerification.verdict === 'interface_evidence_pending' ? 'review' : 'pass',
      signal: `${interfaceVerification.summary.carrierCompleteRows}/${interfaceVerification.summary.rows} required interfaces have endpoint carriers; ${interfaceVerification.summary.acceptedRows} accepted with evidence.`,
      passRatio: interfaceVerification.summary.structuralPassRatio,
      blockers: interfaceVerification.blockers,
      requiredAction: interfaceVerification.verdict === 'accepted_interfaces'
        ? 'Required interfaces have accepted reviewer evidence.'
        : interfaceVerification.verdict === 'interface_review_ready'
          ? 'Required interfaces are structurally ready for reviewer evidence.'
          : interfaceVerification.nextActions.join(' ') || 'Resolve interface verification blockers.',
    },
    {
      area: 'requirement_coverage',
      verdict: requirementCoverage.verdict === 'coverage_blocked' || requirementCoverage.verdict === 'no_requirements'
        ? 'blocked'
        : 'pass',
      signal: `${requirementCoverage.summary.reviewReadyRows + requirementCoverage.summary.acceptedEvidenceRows}/${requirementCoverage.summary.rows} requirements are structurally ready or accepted; accepted evidence ratio ${requirementCoverage.summary.acceptedEvidenceRatio}.`,
      passRatio: requirementCoverage.summary.structuralCoverageRatio,
      blockers: requirementCoverage.blockers,
      requiredAction: requirementCoverage.verdict === 'accepted_evidence'
        ? 'Requirements have accepted reviewer evidence.'
        : requirementCoverage.verdict === 'coverage_review_ready'
          ? 'Requirements are structurally ready for reviewer evidence.'
          : requirementCoverage.nextActions.join(' ') || 'Resolve requirement coverage blockers.',
    },
    {
      area: 'calculation_envelope',
      verdict: calculationBlockers > 0
        ? 'blocked'
        : calculations.summary.needsReview > 0 ? 'review' : 'pass',
      signal: `${calculations.summary.withinEnvelope}/${calculations.summary.rows} calculations are within envelope; ${calculations.summary.needsReview} need review; ${calculationBlockers} block.`,
      passRatio: ratio(calculations.summary.withinEnvelope, calculations.summary.rows),
      blockers: calculations.rows
        .filter(row => row.status === 'blocked' || row.status === 'outside_envelope')
        .map(row => `${row.id}: ${row.interpretation}`),
      requiredAction: calculationBlockers > 0
        ? 'Revise blocked or outside-envelope calculations before engineering review.'
        : calculations.summary.needsReview > 0
          ? 'Attach reviewer evidence to calculations marked needs_review.'
          : 'Calculation envelope has no deterministic blocker.',
    },
    {
      area: 'engineering_assumptions',
      verdict: assumptions.summary.architectureBlockers > 0
        ? 'blocked'
        : assumptionReviewRows > 0 || assumptions.summary.bomBlockers > 0 ? 'review' : 'pass',
      signal: `${assumptions.summary.briefSupported + assumptions.summary.modelPresent}/${assumptions.summary.rows} assumptions are brief-supported or model-present; ${assumptionReviewRows} need review/source evidence; ${assumptions.summary.architectureBlockers} block architecture.`,
      passRatio: ratio(assumptions.summary.briefSupported + assumptions.summary.modelPresent, assumptions.summary.rows),
      blockers: assumptions.rows
        .filter(row => row.blocksArchitecture || row.status === 'blocked')
        .map(row => `${row.id}: ${row.evidenceRequired}`),
      requiredAction: assumptions.summary.architectureBlockers > 0
        ? 'Resolve architecture-blocking assumptions before engineering review.'
        : assumptionReviewRows > 0 || assumptions.summary.bomBlockers > 0
          ? 'Review assumptions and keep BoM/source-required assumptions out of trusted claims until evidence is admitted.'
          : 'Engineering assumptions have no open review blocker.',
    },
  ]

  const blockedRows = rows.filter(row => row.verdict === 'blocked')
  const reviewRows = rows.filter(row => row.verdict === 'review')
  const verdict: PreBomEngineeringVerdict = rows.length === 0 || readiness.moduleCount === 0
    ? 'no_architecture'
    : blockedRows.length > 0
      ? 'engineering_review_blocked'
      : reviewRows.length > 0 ? 'engineering_review_ready' : 'engineering_accepted'

  return {
    verdict,
    summary: {
      rows: rows.length,
      passRows: rows.filter(row => row.verdict === 'pass').length,
      reviewRows: reviewRows.length,
      blockedRows: blockedRows.length,
      passRatio: ratio(rows.filter(row => row.verdict === 'pass').length, rows.length),
      modules: readiness.moduleCount,
      subModules: readiness.subModuleCount,
      componentWords: readiness.componentWordCount,
      componentAllocationVerdict: componentAllocation.verdict,
      interfaceVerificationVerdict: interfaceVerification.verdict,
      requirementCoverageVerdict: requirementCoverage.verdict,
      calculationRows: calculations.summary.rows,
      calculationsWithinEnvelope: calculations.summary.withinEnvelope,
      calculationsNeedingReview: calculations.summary.needsReview,
      calculationBlockers,
      assumptionRows: assumptions.summary.rows,
      assumptionsNeedingReview: assumptionReviewRows,
      assumptionArchitectureBlockers: assumptions.summary.architectureBlockers,
      assumptionBomBlockers: assumptions.summary.bomBlockers,
    },
    rows,
    blockers: blockedRows.flatMap(row => row.blockers.length > 0 ? row.blockers : [`${row.area}: ${row.signal}`]),
    nextActions: Array.from(new Set(rows.filter(row => row.verdict !== 'pass').map(row => row.requiredAction))),
  }
}

export function renderPreBomEngineeringGateCsv(gate: PreBomEngineeringGate): string {
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
