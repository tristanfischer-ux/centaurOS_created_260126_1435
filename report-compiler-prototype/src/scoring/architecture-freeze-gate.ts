import type { ArchitectureReadiness, PipelineStageTrace, ProductDossier, SectionIssue } from '../schema/types'
import { buildBomProvenanceManifest } from '../sourcing/provenance-manifest'
import { buildArchitectureAdmissionGate } from './architecture-admission-gate'
import { buildComponentAllocationGate } from './component-allocation-gate'
import type { DepthBenchmarkModel } from './depth-benchmark'
import { buildInterfaceVerificationGate } from './interface-verification-gate'
import { buildModuleEngineeringGate } from './module-engineering-gate'
import { buildPreBomEngineeringGate } from './pre-bom-engineering-gate'
import { buildRequirementCoverageGate } from './requirement-coverage-gate'
import { buildScratchLineageGate } from './scratch-lineage-gate'
import { buildStageIntegrityGate } from './stage-integrity-gate'

export type ArchitectureFreezeVerdict =
  | 'architecture_frozen_for_sourcing'
  | 'architecture_freeze_review_required'
  | 'architecture_freeze_blocked'
  | 'no_architecture'

export type ArchitectureFreezeArea =
  | 'admission_and_lineage'
  | 'module_structure'
  | 'interface_contracts'
  | 'requirement_coverage'
  | 'engineering_review_state'
  | 'sourcing_boundary'

export type ArchitectureFreezeAreaVerdict = 'pass' | 'review' | 'blocked'

export interface ArchitectureFreezeGateRow {
  area: ArchitectureFreezeArea
  verdict: ArchitectureFreezeAreaVerdict
  signal: string
  passRatio: number
  blockers: string[]
  requiredAction: string
}

export interface ArchitectureFreezeGate {
  verdict: ArchitectureFreezeVerdict
  summary: {
    rows: number
    passRows: number
    reviewRows: number
    blockedRows: number
    passRatio: number
    modules: number
    subModules: number
    componentWords: number
    architectureAdmissionVerdict: string
    stageIntegrityVerdict: string
    scratchLineageVerdict: string
    componentAllocationVerdict: string
    moduleEngineeringVerdict: string
    interfaceVerificationVerdict: string
    requirementCoverageVerdict: string
    preBomEngineeringVerdict: string
    provenanceViolations: number
    structurallyReadyForSourcing: boolean
    independentReviewAccepted: boolean
    nextAction: string | null
  }
  rows: ArchitectureFreezeGateRow[]
  blockers: string[]
  nextActions: string[]
}

export function buildArchitectureFreezeGate(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  stageTrace: PipelineStageTrace[],
  issues: SectionIssue[],
  depthBenchmark?: DepthBenchmarkModel,
): ArchitectureFreezeGate {
  const architectureAdmission = buildArchitectureAdmissionGate(dossier, readiness, stageTrace)
  const stageIntegrity = buildStageIntegrityGate(stageTrace, dossier, readiness)
  const scratchLineage = buildScratchLineageGate(dossier, stageTrace, depthBenchmark)
  const componentAllocation = buildComponentAllocationGate(dossier)
  const moduleEngineering = buildModuleEngineeringGate(dossier, readiness, issues)
  const interfaceVerification = buildInterfaceVerificationGate(dossier, readiness, issues)
  const requirementCoverage = buildRequirementCoverageGate(dossier, readiness, issues)
  const preBomEngineering = buildPreBomEngineeringGate(dossier, readiness, issues)
  const provenance = buildBomProvenanceManifest(dossier)

  const rows: ArchitectureFreezeGateRow[] = [
    {
      area: 'admission_and_lineage',
      verdict: architectureAdmission.verdict === 'architecture_generation_admitted'
        && stageIntegrity.verdict === 'stage_trace_accepted'
        && scratchLineage.verdict === 'scratch_lineage_clean'
        ? 'pass'
        : architectureAdmission.verdict.includes('blocked')
          || architectureAdmission.verdict === 'no_architecture_trace'
          || stageIntegrity.verdict.includes('blocked')
          || stageIntegrity.verdict === 'no_stage_trace'
          || scratchLineage.verdict === 'scratch_lineage_blocked'
            ? 'blocked'
            : 'review',
      signal: `Architecture admission ${architectureAdmission.verdict}; stage integrity ${stageIntegrity.verdict}; scratch lineage ${scratchLineage.verdict}.`,
      passRatio: ratio(architectureAdmission.summary.passRows + stageIntegrity.summary.passRows + scratchLineage.summary.passRows, architectureAdmission.summary.rows + stageIntegrity.summary.rows + scratchLineage.summary.rows),
      blockers: [
        ...architectureAdmission.blockers,
        ...stageIntegrity.blockers,
        ...scratchLineage.blockers,
      ],
      requiredAction: architectureAdmission.verdict === 'architecture_generation_admitted'
        && stageIntegrity.verdict === 'stage_trace_accepted'
        && scratchLineage.verdict === 'scratch_lineage_clean'
        ? 'Architecture was admitted from the scratch flow with clean stage and lineage evidence.'
        : architectureAdmission.verdict.includes('blocked')
          || architectureAdmission.verdict === 'no_architecture_trace'
          || stageIntegrity.verdict.includes('blocked')
          || stageIntegrity.verdict === 'no_stage_trace'
          || scratchLineage.verdict === 'scratch_lineage_blocked'
            ? 'Resolve admission, stage-trace or scratch-lineage blockers before freezing architecture.'
            : 'Keep architecture labelled review-ready until admission, stage trace and scratch lineage are all clean.',
    },
    {
      area: 'module_structure',
      verdict: componentAllocation.verdict === 'allocation_ready'
        && moduleEngineering.verdict === 'module_engineering_ready'
        ? 'pass'
        : componentAllocation.verdict === 'allocation_blocked' || moduleEngineering.verdict === 'module_engineering_blocked' || moduleEngineering.verdict === 'no_modules'
          ? 'blocked'
          : 'review',
      signal: `Component allocation ${componentAllocation.verdict}; module engineering ${moduleEngineering.verdict}; ${moduleEngineering.summary.passRows}/${moduleEngineering.summary.modules} modules pass; ${moduleEngineering.summary.modulesWithCriticalSourcingBlocks} modules still have critical sourcing blocks.`,
      passRatio: ratio(componentAllocation.summary.readySubModules + moduleEngineering.summary.passRows, componentAllocation.summary.subModules + moduleEngineering.summary.modules),
      blockers: [
        ...componentAllocation.blockers,
        ...moduleEngineering.blockers,
      ],
      requiredAction: componentAllocation.verdict === 'allocation_ready'
        && moduleEngineering.verdict === 'module_engineering_ready'
        ? 'Module/submodule/component allocation has no deterministic engineering blocker.'
        : componentAllocation.verdict === 'allocation_blocked' || moduleEngineering.verdict === 'module_engineering_blocked' || moduleEngineering.verdict === 'no_modules'
          ? 'Repair blocked modules, submodules, component allocations or required module interfaces.'
          : 'Treat the architecture as review-ready until module review questions and critical sourcing blocks close.',
    },
    {
      area: 'interface_contracts',
      verdict: interfaceVerification.verdict === 'accepted_interfaces'
        ? 'pass'
        : interfaceVerification.verdict === 'interface_review_ready' || interfaceVerification.verdict === 'interface_evidence_pending'
          ? 'review'
          : 'blocked',
      signal: `Interface verification ${interfaceVerification.verdict}; ${interfaceVerification.summary.carrierCompleteRows}/${interfaceVerification.summary.rows} required interfaces have carriers; ${interfaceVerification.summary.acceptedRows} accepted.`,
      passRatio: interfaceVerification.summary.structuralPassRatio,
      blockers: interfaceVerification.blockers,
      requiredAction: interfaceVerification.verdict === 'accepted_interfaces'
        ? 'Required interfaces have accepted reviewer evidence.'
        : interfaceVerification.verdict === 'interface_review_ready' || interfaceVerification.verdict === 'interface_evidence_pending'
          ? 'Collect or accept interface-review evidence before calling the architecture fully frozen.'
          : 'Repair missing required interface contracts or carrier submodules before freeze.',
    },
    {
      area: 'requirement_coverage',
      verdict: requirementCoverage.verdict === 'accepted_evidence'
        ? 'pass'
        : requirementCoverage.verdict === 'coverage_review_ready'
          ? 'review'
          : 'blocked',
      signal: `Requirement coverage ${requirementCoverage.verdict}; ${requirementCoverage.summary.reviewReadyRows + requirementCoverage.summary.acceptedEvidenceRows}/${requirementCoverage.summary.rows} requirements structurally ready or accepted; accepted ratio ${requirementCoverage.summary.acceptedEvidenceRatio}.`,
      passRatio: requirementCoverage.summary.structuralCoverageRatio,
      blockers: requirementCoverage.blockers,
      requiredAction: requirementCoverage.verdict === 'accepted_evidence'
        ? 'Every parsed requirement has accepted reviewer evidence.'
        : requirementCoverage.verdict === 'coverage_review_ready'
          ? 'Requirement coverage is structurally ready; collect accepted reviewer evidence before full freeze.'
          : 'Link requirements to architecture, submodules, components, review questions and verification activities.',
    },
    {
      area: 'engineering_review_state',
      verdict: preBomEngineering.verdict === 'engineering_accepted'
        ? 'pass'
        : preBomEngineering.verdict === 'engineering_review_ready'
          ? 'review'
          : 'blocked',
      signal: `Pre-BoM engineering ${preBomEngineering.verdict}; ${preBomEngineering.summary.passRows}/${preBomEngineering.summary.rows} areas pass; calculations needing review ${preBomEngineering.summary.calculationsNeedingReview}; assumptions needing review ${preBomEngineering.summary.assumptionsNeedingReview}.`,
      passRatio: preBomEngineering.summary.passRatio,
      blockers: preBomEngineering.blockers,
      requiredAction: preBomEngineering.verdict === 'engineering_accepted'
        ? 'Engineering review gates are accepted for architecture freeze.'
        : preBomEngineering.verdict === 'engineering_review_ready'
          ? 'Keep architecture labelled review-ready until calculations, assumptions and verification evidence are accepted.'
          : 'Resolve pre-BoM engineering blockers before freeze or sourcing promotion.',
    },
    {
      area: 'sourcing_boundary',
      verdict: provenance.summary.provenanceViolations > 0 ? 'blocked' : 'pass',
      signal: `${dossier.bom.lines.length} candidate BoM lines; ${dossier.sources.sourcingEvidence.length} admitted sourcing evidence rows; ${provenance.summary.provenanceViolations} provenance violation(s); ${provenance.summary.criticalMissingSourceClaims} critical missing source claim(s).`,
      passRatio: provenance.summary.provenanceViolations === 0 ? 1 : 0,
      blockers: provenance.rows
        .filter(row => row.status === 'provenance_violation')
        .map(row => `${row.lineId}/${row.field}: ${row.nextAction}`),
      requiredAction: provenance.summary.provenanceViolations === 0
        ? 'Sourcing and BoM claims remain behind explicit admitted source evidence.'
        : 'Remove unprovenanced supplier, manufacturer, MPN, lead-time or cost claims before freeze.',
    },
  ]

  const blockedRows = rows.filter(row => row.verdict === 'blocked')
  const reviewRows = rows.filter(row => row.verdict === 'review')
  const structurallyReadyForSourcing = readiness.moduleCount > 0 && blockedRows.length === 0
  const independentReviewAccepted = structurallyReadyForSourcing && reviewRows.length === 0
  const verdict: ArchitectureFreezeVerdict = readiness.moduleCount === 0
    ? 'no_architecture'
    : blockedRows.length > 0
      ? 'architecture_freeze_blocked'
      : reviewRows.length > 0 ? 'architecture_freeze_review_required' : 'architecture_frozen_for_sourcing'

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
      architectureAdmissionVerdict: architectureAdmission.verdict,
      stageIntegrityVerdict: stageIntegrity.verdict,
      scratchLineageVerdict: scratchLineage.verdict,
      componentAllocationVerdict: componentAllocation.verdict,
      moduleEngineeringVerdict: moduleEngineering.verdict,
      interfaceVerificationVerdict: interfaceVerification.verdict,
      requirementCoverageVerdict: requirementCoverage.verdict,
      preBomEngineeringVerdict: preBomEngineering.verdict,
      provenanceViolations: provenance.summary.provenanceViolations,
      structurallyReadyForSourcing,
      independentReviewAccepted,
      nextAction: rows.find(row => row.verdict === 'blocked')?.requiredAction ?? rows.find(row => row.verdict === 'review')?.requiredAction ?? null,
    },
    rows,
    blockers: blockedRows.flatMap(row => row.blockers.length > 0 ? row.blockers : [`${row.area}: ${row.signal}`]),
    nextActions: Array.from(new Set(rows.filter(row => row.verdict !== 'pass').map(row => row.requiredAction))),
  }
}

export function renderArchitectureFreezeGateCsv(gate: ArchitectureFreezeGate): string {
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
