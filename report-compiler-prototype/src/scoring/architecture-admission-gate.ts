import type { ArchitectureReadiness, PipelineStageTrace, ProductDossier } from '../schema/types'
import { isScratchArchitectureSupported } from '../scratch/universal-modules'
import { buildBriefClarificationPlan } from './brief-clarification-plan'
import { buildBriefIntakeGate } from './brief-intake-gate'
import { buildBomProvenanceManifest } from '../sourcing/provenance-manifest'

export type ArchitectureAdmissionVerdict =
  | 'architecture_generation_admitted'
  | 'architecture_generation_review_required'
  | 'architecture_generation_blocked'
  | 'no_architecture_trace'

export type ArchitectureAdmissionArea =
  | 'brief_intake_clearance'
  | 'clarification_clearance'
  | 'class_grammar_clearance'
  | 'scratch_stage_clearance'
  | 'architecture_readiness_boundary'
  | 'bom_provenance_hold'

export type ArchitectureAdmissionAreaVerdict = 'pass' | 'review' | 'blocked'

export interface ArchitectureAdmissionGateRow {
  area: ArchitectureAdmissionArea
  verdict: ArchitectureAdmissionAreaVerdict
  signal: string
  passRatio: number
  blockers: string[]
  requiredAction: string
}

export interface ArchitectureAdmissionGate {
  verdict: ArchitectureAdmissionVerdict
  summary: {
    rows: number
    passRows: number
    reviewRows: number
    blockedRows: number
    passRatio: number
    productClass: string
    intakeVerdict: string
    clarificationVerdict: string
    nextClarificationQuestion: string | null
    scratchArchitectureSupported: boolean
    architectureStageStatus: string
    architectureSource: string
    readyForBom: boolean
    architectureCanBeUsedForReview: boolean
    architectureCanProceedToBom: boolean
    admittedSourcingEvidenceRows: number
    provenanceViolations: number
    nextAction: string | null
  }
  rows: ArchitectureAdmissionGateRow[]
  blockers: string[]
  nextActions: string[]
}

export function buildArchitectureAdmissionGate(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  stageTrace: PipelineStageTrace[],
): ArchitectureAdmissionGate {
  const intake = buildBriefIntakeGate(dossier, stageTrace)
  const clarification = buildBriefClarificationPlan(dossier, stageTrace)
  const provenance = buildBomProvenanceManifest(dossier)
  const scratchSupported = isScratchArchitectureSupported(dossier.productClass)
  const architectureStage = stageTrace.find(stage => stage.id === 'universal_module_architecture')
  const architectureSource = String(architectureStage?.metrics.architecture_source ?? 'unknown')
  const sourceBackedBomClaims = provenance.summary.sourceBackedClaims
  const hasUnprovenancedBomClaims = provenance.summary.provenanceViolations > 0
  const unknownClass = dossier.productClass === 'unknown'

  const rows: ArchitectureAdmissionGateRow[] = [
    {
      area: 'brief_intake_clearance',
      verdict: intake.verdict === 'brief_ready_for_architecture'
        ? 'pass'
        : intake.verdict === 'brief_intake_review_required' ? 'review' : 'blocked',
      signal: `${intake.summary.passRows}/${intake.summary.rows} intake areas pass; class ${intake.summary.productClass} (${intake.summary.classificationConfidence}); ${intake.summary.extractedRequirements} quantified requirement(s).`,
      passRatio: intake.summary.passRatio,
      blockers: intake.verdict === 'brief_intake_blocked' || intake.verdict === 'no_brief' ? intake.blockers : [],
      requiredAction: intake.verdict === 'brief_ready_for_architecture'
        ? 'Brief intake is strong enough to admit scratch architecture generation.'
        : intake.verdict === 'brief_intake_review_required'
          ? 'Treat generated architecture as review-only until recommended clarification questions are answered.'
          : 'Do not admit architecture generation until the brief intake blockers are resolved.',
    },
    {
      area: 'clarification_clearance',
      verdict: clarification.verdict === 'no_clarification_needed'
        ? 'pass'
        : clarification.verdict === 'clarification_recommended' ? 'review' : 'blocked',
      signal: `${clarification.summary.rows} clarification question(s): ${clarification.summary.requiredRows} required, ${clarification.summary.recommendedRows} recommended, ${clarification.summary.architectureBlockingRows} architecture-blocking.`,
      passRatio: clarification.summary.rows === 0
        ? 1
        : ratio(clarification.summary.rows - clarification.summary.requiredRows - clarification.summary.architectureBlockingRows, clarification.summary.rows),
      blockers: clarification.questions
        .filter(row => row.status === 'required' || row.blocksArchitecture)
        .map(row => `${row.id}: ${row.question}`),
      requiredAction: clarification.verdict === 'no_clarification_needed'
        ? 'No brief clarification is needed before architecture generation.'
        : clarification.verdict === 'clarification_recommended'
          ? 'Keep the architecture labelled as review-only until recommended brief clarifications are answered.'
          : 'Ask and answer the required clarification questions before generating or trusting architecture content.',
    },
    {
      area: 'class_grammar_clearance',
      verdict: !unknownClass && scratchSupported ? 'pass' : unknownClass ? 'blocked' : 'review',
      signal: `Product class ${dossier.productClass}; scratch universal grammar supported: ${scratchSupported ? 'yes' : 'no'}.`,
      passRatio: !unknownClass && scratchSupported ? 1 : 0,
      blockers: unknownClass ? ['Unknown product class cannot be routed through a deep scratch architecture grammar.'] : [],
      requiredAction: !unknownClass && scratchSupported
        ? 'Route this class through the scratch universal module grammar.'
        : unknownClass
          ? 'Resolve product class before generating module architecture.'
          : 'Build or select a deep scratch grammar before claiming universal coverage for this class.',
    },
    {
      area: 'scratch_stage_clearance',
      verdict: !architectureStage
        ? 'blocked'
        : architectureStage.status === 'passed' && architectureSource === 'scratch_universal_architecture'
          ? 'pass'
          : scratchSupported && architectureSource !== 'scratch_universal_architecture' ? 'blocked' : 'review',
      signal: architectureStage
        ? `Architecture stage ${architectureStage.status}; source ${architectureSource}; modules ${readiness.moduleCount}; submodules ${readiness.subModuleCount}; components ${readiness.componentWordCount}.`
        : 'No universal_module_architecture stage exists in the stage trace.',
      passRatio: architectureStage && architectureStage.status === 'passed' && architectureSource === 'scratch_universal_architecture' ? 1 : 0,
      blockers: [
        ...(!architectureStage ? ['Stage trace is missing universal_module_architecture.'] : []),
        ...(architectureStage && scratchSupported && architectureSource !== 'scratch_universal_architecture'
          ? [`Supported scratch class used ${architectureSource} instead of scratch_universal_architecture.`]
          : []),
      ],
      requiredAction: architectureStage && architectureStage.status === 'passed' && architectureSource === 'scratch_universal_architecture'
        ? 'Architecture was produced by the scratch universal architecture stage.'
        : 'Repair the architecture stage before admitting generated module content.',
    },
    {
      area: 'architecture_readiness_boundary',
      verdict: readiness.readyForBom ? 'pass' : 'blocked',
      signal: `Architecture ready for BoM: ${readiness.readyForBom ? 'yes' : 'no'}; blocking issues ${readiness.blockingIssues.length}; required links ${readiness.requiredInterfaceLinks.filter(link => link.present).length}/${readiness.requiredInterfaceLinks.length}.`,
      passRatio: readiness.readyForBom ? 1 : ratio(readiness.requiredInterfaceLinks.filter(link => link.present).length, readiness.requiredInterfaceLinks.length),
      blockers: readiness.blockingIssues.map(issue => `${issue.code}: ${issue.message}`),
      requiredAction: readiness.readyForBom
        ? 'Deterministic architecture readiness checks passed; sourcing work may begin only with explicit evidence.'
        : 'Resolve architecture blockers before starting BoM sourcing or treating the module set as engineering-ready.',
    },
    {
      area: 'bom_provenance_hold',
      verdict: hasUnprovenancedBomClaims ? 'blocked' : 'pass',
      signal: `${dossier.sources.sourcingEvidence.length} admitted sourcing evidence row(s), ${sourceBackedBomClaims} source-backed BoM claim(s), ${provenance.summary.provenanceViolations} provenance violation(s).`,
      passRatio: hasUnprovenancedBomClaims ? 0 : 1,
      blockers: provenance.rows
        .filter(row => row.status === 'provenance_violation')
        .map(row => `${row.lineId}/${row.field}: ${row.nextAction}`),
      requiredAction: hasUnprovenancedBomClaims
        ? 'Clear unprovenanced supplier, manufacturer, MPN, lead-time or cost claims before any BoM costing step.'
        : 'BoM fields remain behind the explicit sourcing-evidence boundary.',
    },
  ]

  const blockedRows = rows.filter(row => row.verdict === 'blocked')
  const reviewRows = rows.filter(row => row.verdict === 'review')
  const verdict: ArchitectureAdmissionVerdict = !architectureStage
    ? 'no_architecture_trace'
    : blockedRows.length > 0
      ? 'architecture_generation_blocked'
      : reviewRows.length > 0 ? 'architecture_generation_review_required' : 'architecture_generation_admitted'
  const architectureCanBeUsedForReview = verdict === 'architecture_generation_admitted' || verdict === 'architecture_generation_review_required'
  const architectureCanProceedToBom = verdict === 'architecture_generation_admitted' && readiness.readyForBom

  return {
    verdict,
    summary: {
      rows: rows.length,
      passRows: rows.filter(row => row.verdict === 'pass').length,
      reviewRows: reviewRows.length,
      blockedRows: blockedRows.length,
      passRatio: ratio(rows.filter(row => row.verdict === 'pass').length, rows.length),
      productClass: dossier.productClass,
      intakeVerdict: intake.verdict,
      clarificationVerdict: clarification.verdict,
      nextClarificationQuestion: clarification.summary.nextQuestionId,
      scratchArchitectureSupported: scratchSupported,
      architectureStageStatus: architectureStage?.status ?? 'missing',
      architectureSource,
      readyForBom: readiness.readyForBom,
      architectureCanBeUsedForReview,
      architectureCanProceedToBom,
      admittedSourcingEvidenceRows: dossier.sources.sourcingEvidence.length,
      provenanceViolations: provenance.summary.provenanceViolations,
      nextAction: rows.find(row => row.verdict === 'blocked')?.requiredAction ?? rows.find(row => row.verdict === 'review')?.requiredAction ?? null,
    },
    rows,
    blockers: blockedRows.flatMap(row => row.blockers.length > 0 ? row.blockers : [`${row.area}: ${row.signal}`]),
    nextActions: Array.from(new Set(rows.filter(row => row.verdict !== 'pass').map(row => row.requiredAction))),
  }
}

export function renderArchitectureAdmissionGateCsv(gate: ArchitectureAdmissionGate): string {
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
  if (denominator === 0) return 0
  return Math.round((numerator / denominator) * 100) / 100
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
