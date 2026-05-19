import { runReportCompiler } from './pipeline/run-report-compiler'
import { buildSourceReferenceQualityGate, renderSourceReferenceQualityGateCsv } from './scoring/source-reference-quality-gate'
import type { SourcingEvidenceRecord } from './schema/types'

const brief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'
const now = new Date('2026-05-17T21:40:00.000+01:00')

async function main(): Promise<void> {
  const unsourced = await runReportCompiler({ id: 'audit-source-quality-unsourced', briefText: brief })
  const unsourcedGate = buildSourceReferenceQualityGate(unsourced.dossier, now)

  assert(unsourcedGate.verdict === 'no_sourcing_evidence', 'Unsourced run should have no source quality rows.')
  assert(unsourcedGate.summary.rows === 0, 'Unsourced source quality gate should have zero rows.')

  const protocol = await runReportCompiler({
    id: 'audit-source-quality-protocol',
    briefText: brief,
    sourcingEvidence: [sourceRecord('test-fixture://source-quality/lfp-prismatic-cells', 'Protocol fixture for source quality audit.')],
  })
  const protocolGate = buildSourceReferenceQualityGate(protocol.dossier, now)

  assert(protocolGate.verdict === 'protocol_source_only', 'Protocol source references should prove mechanics only.')
  assert(protocolGate.summary.protocolFixtureRows === 1, 'Protocol source reference should be counted.')
  assert(protocolGate.rows[0]?.status === 'review', 'Protocol source reference should require review/replacement rather than pass.')

  const placeholder = await runReportCompiler({
    id: 'audit-source-quality-placeholder',
    briefText: brief,
    sourcingEvidence: [sourceRecord('https://example.com/catalogue/lfp-prismatic-cells', 'Production Example Manufacturer catalogue row PROD-LFP-1 prices LFP prismatic cells.')],
  })
  const placeholderGate = buildSourceReferenceQualityGate(placeholder.dossier, now)

  assert(placeholderGate.verdict === 'source_quality_blocked', 'Reserved placeholder domains should block source quality.')
  assert(placeholderGate.summary.placeholderUrlRows === 1, 'Placeholder URL should be counted.')
  assert(placeholderGate.blockers.some(item => item.includes('reserved or placeholder host')), 'Placeholder blocker should explain the reserved host.')

  const weakQuote = await runReportCompiler({
    id: 'audit-source-quality-weak-quote',
    briefText: brief,
    sourcingEvidence: [sourceRecord('https://catalogue.acme-industrial.co.uk/lfp-prismatic-cells', 'Generic catalogue row without the part identity.')],
  })
  const weakQuoteGate = buildSourceReferenceQualityGate(weakQuote.dossier, now)

  assert(weakQuoteGate.verdict === 'source_quality_blocked', 'External source without manufacturer/MPN quote anchor should block source quality.')
  assert(weakQuoteGate.rows[0]?.issues.some(issue => issue.includes('manufacturer or MPN')), 'Weak quote blocker should require manufacturer or MPN anchor.')

  const production = await runReportCompiler({
    id: 'audit-source-quality-production',
    briefText: brief,
    sourcingEvidence: [sourceRecord('https://catalogue.acme-industrial.co.uk/lfp-prismatic-cells', 'Production Example Manufacturer catalogue row PROD-LFP-1 prices LFP prismatic cells.')],
  })
  const productionGate = buildSourceReferenceQualityGate(production.dossier, now)
  const csv = renderSourceReferenceQualityGateCsv(productionGate)

  assert(productionGate.verdict === 'source_quality_ready', 'HTTPS non-placeholder source with anchored quote should pass.')
  assert(productionGate.summary.passRows === 1, 'Production-like source row should pass.')
  assert(productionGate.summary.quoteAnchoredRows === 1, 'Production-like source quote should be anchored to manufacturer or MPN.')
  assert(csv.trim().split('\n').length === productionGate.summary.rows + 1, 'Source quality CSV should contain one header plus one row per source row.')

  console.log('Source reference quality gate audit passed')
  console.log({
    unsourced: unsourcedGate.summary,
    protocol: protocolGate.summary,
    placeholder: placeholderGate.summary,
    weakQuote: weakQuoteGate.summary,
    production: productionGate.summary,
  })
}

function sourceRecord(ref: string, quote: string): SourcingEvidenceRecord {
  return {
    componentWordId: 'lfp_prismatic_cells',
    supplierName: 'Production Example Supplier',
    manufacturer: 'Production Example Manufacturer',
    mpn: 'PROD-LFP-1',
    unitCostGbp: 75,
    leadTimeWeeks: 12,
    sourceGrade: 'priced',
    evidence: {
      kind: 'source',
      ref,
      quote,
    },
    retrievedAt: '2026-05-17T21:40:00.000+01:00',
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
