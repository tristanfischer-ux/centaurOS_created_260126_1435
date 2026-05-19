import type { ArchitectureReadiness, PipelineStageId, PipelineStageTrace, ProductDossier } from '../schema/types'
import { isScratchArchitectureSupported } from '../scratch/universal-modules'
import { buildBomProvenanceManifest } from '../sourcing/provenance-manifest'

export const EXPECTED_STAGE_SEQUENCE: PipelineStageId[] = [
  'brief_parsing',
  'product_class_selection',
  'universal_module_architecture',
  'submodule_expansion',
  'interface_graph',
  'component_candidates',
  'architecture_readiness_gate',
  'sourcing_bom_admission',
]

export type StageIntegrityVerdict =
  | 'stage_trace_accepted'
  | 'stage_trace_review_required'
  | 'stage_trace_blocked'
  | 'no_stage_trace'

export type StageIntegrityArea =
  | 'stage_sequence'
  | 'stage_payloads'
  | 'scratch_architecture_source'
  | 'architecture_before_sourcing'
  | 'sourcing_provenance_boundary'

export type StageIntegrityAreaVerdict = 'pass' | 'review' | 'blocked'

export interface StageIntegrityGateRow {
  area: StageIntegrityArea
  verdict: StageIntegrityAreaVerdict
  signal: string
  passRatio: number
  blockers: string[]
  requiredAction: string
}

export interface StageIntegrityGate {
  verdict: StageIntegrityVerdict
  summary: {
    rows: number
    passRows: number
    reviewRows: number
    blockedRows: number
    passRatio: number
    expectedStages: number
    presentStages: number
    missingStages: string[]
    unexpectedStages: string[]
    orderedStages: boolean
    stagesWithMetrics: number
    stagesWithEvidenceOrExplicitLimitation: number
    stagesWithLimitations: number
    scratchArchitectureSupported: boolean
    architectureSource: string
    architectureReadyForBom: boolean
    admittedSourcingEvidenceRows: number
    admittedPricedLines: number
    provenanceViolations: number
  }
  rows: StageIntegrityGateRow[]
  blockers: string[]
  nextActions: string[]
}

export function buildStageIntegrityGate(
  stageTrace: PipelineStageTrace[],
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
): StageIntegrityGate {
  const expected = EXPECTED_STAGE_SEQUENCE
  const actual = stageTrace.map(stage => stage.id)
  const missingStages = expected.filter(id => !actual.includes(id))
  const unexpectedStages = actual.filter(id => !expected.includes(id))
  const orderedStages = JSON.stringify(actual) === JSON.stringify(expected)
  const stagesWithMetrics = stageTrace.filter(stage => Object.keys(stage.metrics).length > 0).length
  const stagesWithLimitations = stageTrace.filter(stage => stage.limitations.length > 0).length
  const stagesWithEvidenceOrExplicitLimitation = stageTrace.filter(stage => {
    if (stage.evidence.length > 0) return true
    return stage.id === 'sourcing_bom_admission' && stage.limitations.some(item => item.toLowerCase().includes('blocked'))
  }).length
  const scratchSupported = isScratchArchitectureSupported(dossier.productClass)
  const architectureStage = stageTrace.find(stage => stage.id === 'universal_module_architecture')
  const architectureSource = String(architectureStage?.metrics.architecture_source ?? 'unknown')
  const readinessStage = stageTrace.find(stage => stage.id === 'architecture_readiness_gate')
  const sourcingStage = stageTrace.find(stage => stage.id === 'sourcing_bom_admission')
  const provenance = buildBomProvenanceManifest(dossier)
  const unprovenancedCostClaims = dossier.bom.lines
    .filter(line => (line.supplier || line.manufacturer || line.mpn || line.unitCostGbp !== null) && !dossier.sources.sourcingEvidence.some(record => record.componentWordId === line.componentWordId))
    .map(line => line.id)

  const rows: StageIntegrityGateRow[] = [
    {
      area: 'stage_sequence',
      verdict: orderedStages ? 'pass' : 'blocked',
      signal: orderedStages
        ? `${actual.length}/${expected.length} expected compiler stages are present in order.`
        : `Expected ${expected.join(' -> ')} but got ${actual.join(' -> ')}.`,
      passRatio: ratio(expected.length - missingStages.length, expected.length),
      blockers: [
        ...missingStages.map(stage => `Missing stage: ${stage}`),
        ...unexpectedStages.map(stage => `Unexpected stage: ${stage}`),
        ...(orderedStages ? [] : ['Stage order does not match the scratch compiler contract.']),
      ],
      requiredAction: orderedStages
        ? 'Stage sequence matches the scratch compiler contract.'
        : 'Restore the canonical scratch compiler stage order before trusting downstream gates.',
    },
    {
      area: 'stage_payloads',
      verdict: stagesWithMetrics === stageTrace.length
        && stagesWithEvidenceOrExplicitLimitation === stageTrace.length
        && stagesWithLimitations === stageTrace.length
        ? 'pass'
        : 'review',
      signal: `${stagesWithMetrics}/${stageTrace.length} stages have metrics; ${stagesWithEvidenceOrExplicitLimitation}/${stageTrace.length} have evidence or explicit limitation; ${stagesWithLimitations}/${stageTrace.length} have limitations.`,
      passRatio: ratio(stagesWithMetrics + stagesWithEvidenceOrExplicitLimitation + stagesWithLimitations, stageTrace.length * 3),
      blockers: stageTrace
        .filter(stage => Object.keys(stage.metrics).length === 0 || (stage.evidence.length === 0 && !(stage.id === 'sourcing_bom_admission' && stage.limitations.some(item => item.toLowerCase().includes('blocked')))) || stage.limitations.length === 0)
        .map(stage => `${stage.id}: missing metrics, evidence or limitations payload.`),
      requiredAction: stagesWithMetrics === stageTrace.length
        && stagesWithEvidenceOrExplicitLimitation === stageTrace.length
        && stagesWithLimitations === stageTrace.length
        ? 'Every stage carries metrics, evidence or explicit limitation, and limitations.'
        : 'Add metrics, evidence and limitations payloads to weak stage-trace rows.',
    },
    {
      area: 'scratch_architecture_source',
      verdict: scratchSupported && architectureSource === 'scratch_universal_architecture'
        ? 'pass'
        : scratchSupported ? 'blocked' : 'review',
      signal: `Product class ${dossier.productClass}; architecture source ${architectureSource}; scratch grammar supported: ${scratchSupported ? 'yes' : 'no'}.`,
      passRatio: scratchSupported && architectureSource === 'scratch_universal_architecture' ? 1 : 0,
      blockers: scratchSupported && architectureSource !== 'scratch_universal_architecture'
        ? [`Supported scratch class ${dossier.productClass} did not use scratch_universal_architecture.`]
        : [],
      requiredAction: scratchSupported && architectureSource === 'scratch_universal_architecture'
        ? 'Architecture came from the scratch universal grammar.'
        : scratchSupported
          ? 'Route supported product classes through the scratch universal architecture grammar.'
          : 'Build a deep scratch grammar for this product class before treating it as universal coverage.',
    },
    {
      area: 'architecture_before_sourcing',
      verdict: architectureAndSourcingStatusAreConsistent(readinessStage, sourcingStage, readiness) ? 'pass' : 'blocked',
      signal: `Architecture ready: ${readiness.readyForBom ? 'yes' : 'no'}; readiness stage ${readinessStage?.status ?? 'missing'}; sourcing stage ${sourcingStage?.status ?? 'missing'}.`,
      passRatio: architectureAndSourcingStatusAreConsistent(readinessStage, sourcingStage, readiness) ? 1 : 0,
      blockers: architectureAndSourcingStatusAreConsistent(readinessStage, sourcingStage, readiness)
        ? []
        : ['Sourcing stage status is inconsistent with architecture readiness.'],
      requiredAction: architectureAndSourcingStatusAreConsistent(readinessStage, sourcingStage, readiness)
        ? 'Sourcing stage is downstream of architecture readiness and has a consistent status.'
        : 'Keep sourcing blocked when architecture readiness is blocked, and only allow warning/pass after architecture readiness.',
    },
    {
      area: 'sourcing_provenance_boundary',
      verdict: provenance.summary.provenanceViolations > 0 || unprovenancedCostClaims.length > 0 ? 'blocked' : 'pass',
      signal: `${dossier.sources.sourcingEvidence.length} admitted source evidence row(s), ${dossier.sourcing.admission.admittedLines} admitted priced line(s), ${provenance.summary.provenanceViolations} provenance violation(s).`,
      passRatio: provenance.summary.provenanceViolations === 0 && unprovenancedCostClaims.length === 0 ? 1 : 0,
      blockers: [
        ...provenance.rows
          .filter(row => row.status === 'provenance_violation')
          .map(row => `${row.lineId}/${row.field}: ${row.nextAction}`),
        ...unprovenancedCostClaims.map(lineId => `${lineId}: populated supplier/manufacturer/MPN/cost claim has no admitted source evidence.`),
      ],
      requiredAction: provenance.summary.provenanceViolations === 0 && unprovenancedCostClaims.length === 0
        ? 'Supplier, manufacturer, MPN and cost fields stay behind admitted sourcing evidence.'
        : 'Clear unprovenanced BoM claims or admit explicit source evidence through sourcing intake.',
    },
  ]

  const blockedRows = rows.filter(row => row.verdict === 'blocked')
  const reviewRows = rows.filter(row => row.verdict === 'review')
  const verdict: StageIntegrityVerdict = stageTrace.length === 0
    ? 'no_stage_trace'
    : blockedRows.length > 0
      ? 'stage_trace_blocked'
      : reviewRows.length > 0 ? 'stage_trace_review_required' : 'stage_trace_accepted'

  return {
    verdict,
    summary: {
      rows: rows.length,
      passRows: rows.filter(row => row.verdict === 'pass').length,
      reviewRows: reviewRows.length,
      blockedRows: blockedRows.length,
      passRatio: ratio(rows.filter(row => row.verdict === 'pass').length, rows.length),
      expectedStages: expected.length,
      presentStages: actual.length,
      missingStages,
      unexpectedStages,
      orderedStages,
      stagesWithMetrics,
      stagesWithEvidenceOrExplicitLimitation,
      stagesWithLimitations,
      scratchArchitectureSupported: scratchSupported,
      architectureSource,
      architectureReadyForBom: readiness.readyForBom,
      admittedSourcingEvidenceRows: dossier.sources.sourcingEvidence.length,
      admittedPricedLines: dossier.sourcing.admission.admittedLines,
      provenanceViolations: provenance.summary.provenanceViolations,
    },
    rows,
    blockers: blockedRows.flatMap(row => row.blockers.length > 0 ? row.blockers : [`${row.area}: ${row.signal}`]),
    nextActions: Array.from(new Set(rows.filter(row => row.verdict !== 'pass').map(row => row.requiredAction))),
  }
}

export function renderStageIntegrityGateCsv(gate: StageIntegrityGate): string {
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

function architectureAndSourcingStatusAreConsistent(
  readinessStage: PipelineStageTrace | undefined,
  sourcingStage: PipelineStageTrace | undefined,
  readiness: ArchitectureReadiness,
): boolean {
  if (!readinessStage || !sourcingStage) return false
  if (!readiness.readyForBom) return readinessStage.status === 'blocked' && sourcingStage.status === 'blocked'
  return readinessStage.status === 'passed' && sourcingStage.status !== 'blocked'
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return 0
  return Math.round((numerator / denominator) * 100) / 100
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
