import type { ProductDossier } from '../schema/types'
import { buildComponentIdentityWorklist } from '../sourcing/component-identity'
import { buildSourcingLineLedger } from '../sourcing/ledger'
import { buildBomProvenanceManifest } from '../sourcing/provenance-manifest'
import { buildEvidenceAuthenticityGate } from './evidence-authenticity'
import { buildSourceReferenceQualityGate } from './source-reference-quality-gate'

export type BomCostingVerdict =
  | 'costing_ready'
  | 'costing_protocol_only'
  | 'costing_review_required'
  | 'costing_blocked'
  | 'costing_not_started'

export type BomCostingArea =
  | 'sourcing_admission'
  | 'critical_line_pricing'
  | 'source_backed_provenance'
  | 'component_identity'
  | 'sourcing_evidence_authenticity'
  | 'source_reference_quality'
  | 'cost_totals'

export type BomCostingAreaVerdict = 'pass' | 'review' | 'blocked'

export interface BomCostingGateRow {
  area: BomCostingArea
  verdict: BomCostingAreaVerdict
  signal: string
  passRatio: number
  blockers: string[]
  requiredAction: string
}

export interface BomCostingGate {
  verdict: BomCostingVerdict
  summary: {
    rows: number
    passRows: number
    reviewRows: number
    blockedRows: number
    passRatio: number
    bomLines: number
    criticalBomLines: number
    pricedLines: number
    pricedCriticalLines: number
    unpricedLines: number
    unpricedCriticalLines: number
    sourceBackedClaims: number
    criticalMissingSourceClaims: number
    provenanceViolations: number
    duplicateComponentGroups: number
    duplicateCriticalComponentGroups: number
    sourcingEvidenceRows: number
    productionReadySourcingEvidenceRows: number
    protocolSourcingEvidenceRows: number
    sourcingEvidenceReviewRows: number
    sourceQualityVerdict: string
    sourceQualityPassRows: number
    sourceQualityRows: number
    placeholderSourceRows: number
    quoteAnchoredSourceRows: number
    freshTimestampSourceRows: number
    capexGbp: number
    bomTotalCostGbp: number
  }
  rows: BomCostingGateRow[]
  blockers: string[]
  nextActions: string[]
}

export function buildBomCostingGate(dossier: ProductDossier): BomCostingGate {
  const ledger = buildSourcingLineLedger(dossier)
  const manifest = buildBomProvenanceManifest(dossier)
  const identity = buildComponentIdentityWorklist(dossier.bom)
  const authenticity = buildEvidenceAuthenticityGate(dossier)
  const sourceQuality = buildSourceReferenceQualityGate(dossier)
  const sourcingAuthenticityRows = authenticity.rows.filter(row => row.kind === 'sourcing')
  const productionReadySourcingEvidenceRows = sourcingAuthenticityRows
    .filter(row => row.status === 'accepted_production_evidence')
    .length
  const protocolSourcingEvidenceRows = sourcingAuthenticityStatusCount(sourcingAuthenticityRows, 'protocol_fixture')
  const sourcingEvidenceReviewRows = sourcingAuthenticityRows.length
    - productionReadySourcingEvidenceRows
    - protocolSourcingEvidenceRows

  const rows: BomCostingGateRow[] = [
    {
      area: 'sourcing_admission',
      verdict: ledger.summary.rejectedEvidenceRecords > 0
        ? 'blocked'
        : ledger.summary.admittedPricedLines === 0
          ? 'blocked'
          : ledger.summary.criticalUnpricedLines > 0
            ? 'blocked'
            : ledger.summary.unpricedLines > 0 ? 'review' : 'pass',
      signal: `${ledger.summary.admittedPricedLines}/${ledger.summary.bomLines} BoM lines have admitted pricing; rejected source records ${ledger.summary.rejectedEvidenceRecords}.`,
      passRatio: ledger.summary.pricedLineRatio,
      blockers: [
        ...ledger.rows
          .filter(row => row.ledgerStatus === 'critical_unpriced' || row.ledgerStatus === 'rejected_evidence')
          .map(row => `${row.lineId}: ${row.nextAction}`),
      ],
      requiredAction: ledger.summary.admittedPricedLines === 0
        ? 'Admit source-backed supplier, manufacturer, MPN and unit-cost evidence before costing review.'
        : ledger.summary.rejectedEvidenceRecords > 0 || ledger.summary.criticalUnpricedLines > 0
          ? 'Resolve rejected evidence records and price every critical line through sourcing intake.'
          : ledger.summary.unpricedLines > 0
            ? 'Price remaining non-critical lines before procurement use.'
            : 'Sourcing admission has priced every BoM line.',
    },
    {
      area: 'critical_line_pricing',
      verdict: ledger.summary.criticalLines === 0
        ? 'review'
        : ledger.summary.criticalUnpricedLines > 0 ? 'blocked' : 'pass',
      signal: `${ledger.summary.criticalPricedLines}/${ledger.summary.criticalLines} critical lines have admitted unit costs.`,
      passRatio: ledger.summary.criticalCoverageRatio,
      blockers: ledger.rows
        .filter(row => row.priority === 'critical' && row.unitCostGbp === null)
        .map(row => `${row.lineId}: ${row.description}`),
      requiredAction: ledger.summary.criticalLines === 0
        ? 'Confirm whether this class should have critical BoM lines before using cost totals.'
        : ledger.summary.criticalUnpricedLines > 0
          ? 'Price every critical line from admitted source evidence.'
          : 'Critical BoM lines have admitted pricing.',
    },
    {
      area: 'source_backed_provenance',
      verdict: manifest.summary.provenanceViolations > 0 || manifest.summary.criticalMissingSourceClaims > 0
        ? 'blocked'
        : manifest.summary.sourceBackedClaims === 0 ? 'review' : 'pass',
      signal: `${manifest.summary.sourceBackedClaims} source-backed claims; ${manifest.summary.criticalMissingSourceClaims} critical missing-source claims; ${manifest.summary.provenanceViolations} provenance violations.`,
      passRatio: ratio(
        manifest.summary.sourceBackedClaims + manifest.summary.notClaimedRows,
        manifest.summary.claimRows,
      ),
      blockers: manifest.rows
        .filter(row => row.status === 'provenance_violation' || (row.critical && row.status === 'missing_source'))
        .map(row => `${row.lineId}/${row.field}: ${row.nextAction}`),
      requiredAction: manifest.summary.provenanceViolations > 0 || manifest.summary.criticalMissingSourceClaims > 0
        ? 'Keep supplier, manufacturer, MPN, unit cost and lead-time fields empty until source-backed evidence is admitted.'
        : manifest.summary.sourceBackedClaims === 0
          ? 'Attach source-backed claims before trusting BoM cost output.'
          : 'BoM claim provenance is attached for admitted claims.',
    },
    {
      area: 'component_identity',
      verdict: identity.summary.duplicateCriticalComponentGroups > 0
        ? 'blocked'
        : identity.summary.duplicateComponentGroups > 0 ? 'review' : 'pass',
      signal: `${identity.summary.duplicateComponentGroups} duplicate component identity group(s); ${identity.summary.duplicateCriticalComponentGroups} include critical lines.`,
      passRatio: ratio(identity.summary.distinctComponentWordIds, identity.summary.bomLines),
      blockers: identity.groups.map(group => `${group.componentWordId}: ${group.recommendation}`),
      requiredAction: identity.summary.duplicateCriticalComponentGroups > 0
        ? 'Resolve duplicated critical component identities before admitting or deduplicating costs.'
        : identity.summary.duplicateComponentGroups > 0
          ? 'Review duplicated component identities before procurement use.'
          : 'Component identities are unique enough for line-level costing.',
    },
    {
      area: 'sourcing_evidence_authenticity',
      verdict: sourcingAuthenticityRows.length === 0
        ? 'blocked'
        : productionReadySourcingEvidenceRows === sourcingAuthenticityRows.length
          ? 'pass'
          : 'review',
      signal: `${productionReadySourcingEvidenceRows}/${sourcingAuthenticityRows.length} sourcing evidence rows are production-ready; ${protocolSourcingEvidenceRows} protocol fixture, ${sourcingEvidenceReviewRows} review/missing metadata.`,
      passRatio: ratio(productionReadySourcingEvidenceRows, sourcingAuthenticityRows.length),
      blockers: sourcingAuthenticityRows
        .filter(row => row.status !== 'accepted_production_evidence')
        .map(row => `${row.id}: ${row.reason}`),
      requiredAction: sourcingAuthenticityRows.length === 0
        ? 'Add sourcing evidence rows before BoM costing can start.'
        : productionReadySourcingEvidenceRows === sourcingAuthenticityRows.length
          ? 'Sourcing evidence references are production-ready; refresh before procurement.'
          : 'Replace protocol or weak sourcing evidence with retrievable supplier/catalogue evidence and complete metadata.',
    },
    {
      area: 'source_reference_quality',
      verdict: sourceQuality.verdict === 'source_quality_blocked' || sourceQuality.verdict === 'no_sourcing_evidence'
        ? 'blocked'
        : sourceQuality.verdict === 'source_quality_ready' ? 'pass' : 'review',
      signal: `${sourceQuality.summary.passRows}/${sourceQuality.summary.rows} sourcing refs pass quality checks; ${sourceQuality.summary.placeholderUrlRows} placeholder URL, ${sourceQuality.summary.quoteAnchoredRows} quote-anchored, ${sourceQuality.summary.freshTimestampRows} fresh timestamp.`,
      passRatio: sourceQuality.summary.passRatio,
      blockers: sourceQuality.blockers,
      requiredAction: sourceQuality.verdict === 'source_quality_ready'
        ? 'Sourcing references pass non-network source quality checks; refresh before procurement.'
        : sourceQuality.nextActions.join(' ') || 'Add source references before costing review.',
    },
    {
      area: 'cost_totals',
      verdict: ledger.summary.criticalUnpricedLines > 0
        ? 'blocked'
        : dossier.cost.capexGbp > 0 && dossier.bom.totalCostGbp > 0 ? 'pass' : 'review',
      signal: `BoM total ${dossier.bom.totalCostGbp} GBP; CAPEX ${dossier.cost.capexGbp} GBP; annual OPEX ${dossier.cost.opexAnnualGbp} GBP.`,
      passRatio: dossier.bom.lines.length === 0 ? 0 : ratio(ledger.summary.admittedPricedLines, dossier.bom.lines.length),
      blockers: ledger.summary.criticalUnpricedLines > 0
        ? [`${ledger.summary.criticalUnpricedLines} critical line(s) are unpriced, so totals are incomplete.`]
        : [],
      requiredAction: ledger.summary.criticalUnpricedLines > 0
        ? 'Do not use cost totals until every critical line has an admitted unit cost.'
        : dossier.cost.capexGbp > 0 && dossier.bom.totalCostGbp > 0
          ? 'Cost totals are internally populated from admitted BoM pricing.'
          : 'Populate cost totals only from admitted BoM pricing.',
    },
  ]

  const blockedRows = rows.filter(row => row.verdict === 'blocked')
  const reviewRows = rows.filter(row => row.verdict === 'review')
  const verdict: BomCostingVerdict = dossier.bom.lines.length === 0 || sourcingAuthenticityRows.length === 0
    ? 'costing_not_started'
    : blockedRows.length > 0
      ? 'costing_blocked'
      : protocolSourcingEvidenceRows > 0 || sourceQuality.verdict === 'protocol_source_only'
        ? 'costing_protocol_only'
        : reviewRows.length > 0 ? 'costing_review_required' : 'costing_ready'

  return {
    verdict,
    summary: {
      rows: rows.length,
      passRows: rows.filter(row => row.verdict === 'pass').length,
      reviewRows: reviewRows.length,
      blockedRows: blockedRows.length,
      passRatio: ratio(rows.filter(row => row.verdict === 'pass').length, rows.length),
      bomLines: ledger.summary.bomLines,
      criticalBomLines: ledger.summary.criticalLines,
      pricedLines: ledger.summary.admittedPricedLines,
      pricedCriticalLines: ledger.summary.criticalPricedLines,
      unpricedLines: ledger.summary.unpricedLines,
      unpricedCriticalLines: ledger.summary.criticalUnpricedLines,
      sourceBackedClaims: manifest.summary.sourceBackedClaims,
      criticalMissingSourceClaims: manifest.summary.criticalMissingSourceClaims,
      provenanceViolations: manifest.summary.provenanceViolations,
      duplicateComponentGroups: identity.summary.duplicateComponentGroups,
      duplicateCriticalComponentGroups: identity.summary.duplicateCriticalComponentGroups,
      sourcingEvidenceRows: sourcingAuthenticityRows.length,
      productionReadySourcingEvidenceRows,
      protocolSourcingEvidenceRows,
      sourcingEvidenceReviewRows,
      sourceQualityVerdict: sourceQuality.verdict,
      sourceQualityPassRows: sourceQuality.summary.passRows,
      sourceQualityRows: sourceQuality.summary.rows,
      placeholderSourceRows: sourceQuality.summary.placeholderUrlRows,
      quoteAnchoredSourceRows: sourceQuality.summary.quoteAnchoredRows,
      freshTimestampSourceRows: sourceQuality.summary.freshTimestampRows,
      capexGbp: dossier.cost.capexGbp,
      bomTotalCostGbp: dossier.bom.totalCostGbp,
    },
    rows,
    blockers: blockedRows.flatMap(row => row.blockers.length > 0 ? row.blockers : [`${row.area}: ${row.signal}`]),
    nextActions: Array.from(new Set(rows.filter(row => row.verdict !== 'pass').map(row => row.requiredAction))),
  }
}

export function renderBomCostingGateCsv(gate: BomCostingGate): string {
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

function sourcingAuthenticityStatusCount(
  rows: ReturnType<typeof buildEvidenceAuthenticityGate>['rows'],
  status: ReturnType<typeof buildEvidenceAuthenticityGate>['rows'][number]['status'],
): number {
  return rows.filter(row => row.status === status).length
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return 0
  return Math.round((numerator / denominator) * 100) / 100
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
