import type { ArchitectureReadiness, PipelineStageTrace, ProductDossier } from '../schema/types'
import { buildBomProvenanceManifest } from '../sourcing/provenance-manifest'
import { buildSourcingAuthorizationGate } from './sourcing-authorization-gate'
import { buildBomCostingGate } from './bom-costing-gate'
import { buildEvidenceAuthenticityGate } from './evidence-authenticity'
import { buildSourceReferenceQualityGate } from './source-reference-quality-gate'

export type BomAdmissionVerdict =
  | 'candidate_bom_authorized'
  | 'candidate_bom_review_required'
  | 'bom_admission_partial'
  | 'bom_admission_protocol_only'
  | 'critical_bom_admitted'
  | 'bom_admission_blocked'

export type BomDisplayMode =
  | 'candidate_only'
  | 'partial_priced_review'
  | 'protocol_priced_fixture'
  | 'critical_source_backed'
  | 'blocked'

export type BomAdmissionArea =
  | 'sourcing_authorization'
  | 'candidate_bom_scope'
  | 'source_admission_state'
  | 'critical_bom_admission'
  | 'source_reference_quality'
  | 'provenance_boundary'
  | 'display_mode'

export type BomAdmissionAreaVerdict = 'pass' | 'review' | 'blocked'

export interface BomAdmissionGateRow {
  area: BomAdmissionArea
  verdict: BomAdmissionAreaVerdict
  signal: string
  passRatio: number
  blockers: string[]
  requiredAction: string
}

export interface BomAdmissionGate {
  verdict: BomAdmissionVerdict
  summary: {
    rows: number
    passRows: number
    reviewRows: number
    blockedRows: number
    passRatio: number
    displayMode: BomDisplayMode
    bomLines: number
    criticalBomLines: number
    pricedLines: number
    pricedCriticalLines: number
    unpricedCriticalLines: number
    sourceBackedClaims: number
    criticalMissingSourceClaims: number
    provenanceViolations: number
    sourcingAuthorizationVerdict: string
    bomCostingVerdict: string
    sourceQualityVerdict: string
    productionReadySourcingEvidenceRows: number
    protocolSourcingEvidenceRows: number
    canRenderCandidateBom: boolean
    canRenderPricedBom: boolean
    canUseForProcurement: boolean
    nextAction: string | null
  }
  rows: BomAdmissionGateRow[]
  blockers: string[]
  nextActions: string[]
}

export function buildBomAdmissionGate(
  dossier: ProductDossier,
  readiness: ArchitectureReadiness,
  stageTrace: PipelineStageTrace[],
): BomAdmissionGate {
  const sourcingAuthorization = buildSourcingAuthorizationGate(dossier, readiness, stageTrace)
  const costing = buildBomCostingGate(dossier)
  const provenance = buildBomProvenanceManifest(dossier)
  const authenticity = buildEvidenceAuthenticityGate(dossier)
  const sourceQuality = buildSourceReferenceQualityGate(dossier)
  const sourcingAuthenticityRows = authenticity.rows.filter(row => row.kind === 'sourcing')
  const productionReadySourcingEvidenceRows = sourcingAuthenticityRows
    .filter(row => row.status === 'accepted_production_evidence')
    .length
  const protocolSourcingEvidenceRows = sourcingAuthenticityRows
    .filter(row => row.status === 'protocol_fixture')
    .length
  const hasSourceEvidence = dossier.sources.sourcingEvidence.length > 0
  const allCriticalPriced = costing.summary.criticalBomLines > 0
    && costing.summary.unpricedCriticalLines === 0
  const productionCriticalReady = allCriticalPriced
    && sourceQuality.verdict === 'source_quality_ready'
    && productionReadySourcingEvidenceRows === dossier.sources.sourcingEvidence.length
    && provenance.summary.provenanceViolations === 0
  const protocolOnly = hasSourceEvidence
    && (protocolSourcingEvidenceRows === dossier.sources.sourcingEvidence.length
      || sourceQuality.verdict === 'protocol_source_only'
      || costing.verdict === 'costing_protocol_only')

  const rows: BomAdmissionGateRow[] = [
    {
      area: 'sourcing_authorization',
      verdict: sourcingAuthorization.summary.sourcingAuthorized
        ? 'pass'
        : sourcingAuthorization.verdict === 'sourcing_authorization_review_required' ? 'review' : 'blocked',
      signal: `${sourcingAuthorization.verdict}; authorized ${sourcingAuthorization.summary.sourcingAuthorized ? 'yes' : 'no'}; ${sourcingAuthorization.summary.passRows}/${sourcingAuthorization.summary.rows} areas pass.`,
      passRatio: sourcingAuthorization.summary.passRatio,
      blockers: sourcingAuthorization.summary.sourcingAuthorized ? [] : sourcingAuthorization.blockers,
      requiredAction: sourcingAuthorization.summary.sourcingAuthorized
        ? 'Sourcing is authorized, so the BoM may be shown as a candidate sourcing queue.'
        : sourcingAuthorization.verdict === 'sourcing_authorization_review_required'
          ? 'Keep BoM admission review-only until sourcing authorization clears.'
          : 'Do not admit BoM display beyond blockers until sourcing authorization clears.',
    },
    {
      area: 'candidate_bom_scope',
      verdict: costing.summary.bomLines > 0 ? 'pass' : 'blocked',
      signal: `${costing.summary.bomLines} candidate BoM line(s), ${costing.summary.criticalBomLines} critical line(s).`,
      passRatio: costing.summary.bomLines > 0 ? 1 : 0,
      blockers: costing.summary.bomLines > 0 ? [] : ['No candidate BoM lines exist.'],
      requiredAction: costing.summary.bomLines > 0
        ? 'Candidate BoM scope exists for sourcing and evidence collection.'
        : 'Generate candidate component lines before BoM admission.',
    },
    {
      area: 'source_admission_state',
      verdict: dossier.sourcing.admission.rejectedRecords.length > 0
        ? 'review'
        : hasSourceEvidence ? 'pass' : 'review',
      signal: `${dossier.sources.sourcingEvidence.length} admitted source row(s), ${dossier.sourcing.admission.rejectedRecords.length} rejected source row(s), ${costing.summary.pricedLines}/${costing.summary.bomLines} priced line(s).`,
      passRatio: ratio(costing.summary.pricedLines, costing.summary.bomLines),
      blockers: dossier.sourcing.admission.rejectedRecords.map(row => `${row.componentWordId}: ${row.reason}`),
      requiredAction: dossier.sourcing.admission.rejectedRecords.length > 0
        ? 'Repair or discard rejected sourcing evidence before admitting priced BoM claims.'
        : hasSourceEvidence
          ? 'Admitted source rows may populate only their matched BoM fields.'
          : 'No source rows are admitted; keep this as a candidate-only BoM.',
    },
    {
      area: 'critical_bom_admission',
      verdict: allCriticalPriced
        ? 'pass'
        : hasSourceEvidence ? 'review' : 'review',
      signal: `${costing.summary.pricedCriticalLines}/${costing.summary.criticalBomLines} critical line(s) have admitted unit costs; ${costing.summary.unpricedCriticalLines} critical line(s) remain unpriced.`,
      passRatio: ratio(costing.summary.pricedCriticalLines, costing.summary.criticalBomLines),
      blockers: [],
      requiredAction: allCriticalPriced
        ? 'Critical BoM lines are admitted with source-backed pricing.'
        : hasSourceEvidence
          ? 'Continue sourcing until every critical BoM line has admitted source-backed supplier, MPN and price evidence.'
          : 'Start with critical sourcing intake before treating any BoM cost as admitted.',
    },
    {
      area: 'source_reference_quality',
      verdict: sourceQuality.verdict === 'source_quality_ready'
        ? 'pass'
        : sourceQuality.verdict === 'source_quality_blocked' ? 'blocked' : 'review',
      signal: `${sourceQuality.verdict}; ${sourceQuality.summary.passRows}/${sourceQuality.summary.rows} source-quality rows pass; ${sourceQuality.summary.protocolFixtureRows} protocol fixture row(s).`,
      passRatio: sourceQuality.summary.passRatio,
      blockers: sourceQuality.verdict === 'source_quality_blocked' ? sourceQuality.blockers : [],
      requiredAction: sourceQuality.verdict === 'source_quality_ready'
        ? 'Source references are production-ready by non-network checks; refresh before procurement.'
        : sourceQuality.verdict === 'no_sourcing_evidence'
          ? 'No source evidence is present; keep the BoM candidate-only.'
          : 'Replace weak, protocol or placeholder source references before production BoM admission.',
    },
    {
      area: 'provenance_boundary',
      verdict: provenance.summary.provenanceViolations > 0
        ? 'blocked'
        : provenance.summary.criticalMissingSourceClaims > 0 ? 'review' : 'pass',
      signal: `${provenance.summary.sourceBackedClaims} source-backed claim(s), ${provenance.summary.criticalMissingSourceClaims} critical missing-source claim(s), ${provenance.summary.provenanceViolations} provenance violation(s).`,
      passRatio: provenance.summary.provenanceViolations > 0
        ? 0
        : ratio(provenance.summary.sourceBackedClaims + provenance.summary.notClaimedRows, provenance.summary.claimRows),
      blockers: provenance.rows
        .filter(row => row.status === 'provenance_violation')
        .map(row => `${row.lineId}/${row.field}: ${row.nextAction}`),
      requiredAction: provenance.summary.provenanceViolations > 0
        ? 'Remove unprovenanced supplier, manufacturer, MPN, lead-time or cost fields before BoM admission.'
        : provenance.summary.criticalMissingSourceClaims > 0
          ? 'Missing critical source claims are acceptable only in candidate-only mode; collect evidence before priced BoM use.'
          : 'BoM claims remain behind explicit source evidence.',
    },
    {
      area: 'display_mode',
      verdict: displayModeVerdict(displayMode({
        blocked: false,
        hasSourceEvidence,
        protocolOnly,
        productionCriticalReady,
      })),
      signal: `Display mode will be ${displayMode({
        blocked: false,
        hasSourceEvidence,
        protocolOnly,
        productionCriticalReady,
      })}.`,
      passRatio: productionCriticalReady ? 1 : hasSourceEvidence ? 0.5 : 0.25,
      blockers: [],
      requiredAction: productionCriticalReady
        ? 'Show admitted critical priced BoM with source references; mark remaining candidate lines explicitly.'
        : protocolOnly
          ? 'Show protocol-priced rows only as fixture evidence; do not use for production cost claims.'
          : hasSourceEvidence
            ? 'Show sourced rows as partial review output and keep missing fields blank.'
            : 'Show candidate BoM as a sourcing queue with supplier, MPN and cost fields empty.',
    },
  ]

  const blockedRows = rows.filter(row => row.verdict === 'blocked')
  const reviewRows = rows.filter(row => row.verdict === 'review')
  const mode = displayMode({
    blocked: blockedRows.length > 0,
    hasSourceEvidence,
    protocolOnly,
    productionCriticalReady,
  })
  const verdict: BomAdmissionVerdict = mode === 'blocked'
    ? 'bom_admission_blocked'
    : mode === 'critical_source_backed'
      ? 'critical_bom_admitted'
      : mode === 'protocol_priced_fixture'
        ? 'bom_admission_protocol_only'
      : mode === 'partial_priced_review'
        ? 'bom_admission_partial'
        : sourcingAuthorization.summary.sourcingAuthorized ? 'candidate_bom_authorized' : 'candidate_bom_review_required'

  return {
    verdict,
    summary: {
      rows: rows.length,
      passRows: rows.filter(row => row.verdict === 'pass').length,
      reviewRows: reviewRows.length,
      blockedRows: blockedRows.length,
      passRatio: ratio(rows.filter(row => row.verdict === 'pass').length, rows.length),
      displayMode: mode,
      bomLines: costing.summary.bomLines,
      criticalBomLines: costing.summary.criticalBomLines,
      pricedLines: costing.summary.pricedLines,
      pricedCriticalLines: costing.summary.pricedCriticalLines,
      unpricedCriticalLines: costing.summary.unpricedCriticalLines,
      sourceBackedClaims: provenance.summary.sourceBackedClaims,
      criticalMissingSourceClaims: provenance.summary.criticalMissingSourceClaims,
      provenanceViolations: provenance.summary.provenanceViolations,
      sourcingAuthorizationVerdict: sourcingAuthorization.verdict,
      bomCostingVerdict: costing.verdict,
      sourceQualityVerdict: sourceQuality.verdict,
      productionReadySourcingEvidenceRows,
      protocolSourcingEvidenceRows,
      canRenderCandidateBom: mode !== 'blocked',
      canRenderPricedBom: mode === 'partial_priced_review' || mode === 'protocol_priced_fixture' || mode === 'critical_source_backed',
      canUseForProcurement: false,
      nextAction: rows.find(row => row.verdict === 'blocked')?.requiredAction ?? rows.find(row => row.verdict === 'review')?.requiredAction ?? null,
    },
    rows,
    blockers: blockedRows.flatMap(row => row.blockers.length > 0 ? row.blockers : [`${row.area}: ${row.signal}`]),
    nextActions: Array.from(new Set(rows.filter(row => row.verdict !== 'pass').map(row => row.requiredAction))),
  }
}

export function renderBomAdmissionGateCsv(gate: BomAdmissionGate): string {
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

function displayMode(args: {
  blocked: boolean
  hasSourceEvidence: boolean
  protocolOnly: boolean
  productionCriticalReady: boolean
}): BomDisplayMode {
  if (args.blocked) return 'blocked'
  if (args.productionCriticalReady) return 'critical_source_backed'
  if (args.protocolOnly) return 'protocol_priced_fixture'
  if (args.hasSourceEvidence) return 'partial_priced_review'
  return 'candidate_only'
}

function displayModeVerdict(mode: BomDisplayMode): BomAdmissionAreaVerdict {
  if (mode === 'blocked') return 'blocked'
  if (mode === 'critical_source_backed') return 'pass'
  return 'review'
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return 1
  return Math.round((numerator / denominator) * 100) / 100
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
