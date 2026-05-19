import type { ProductDossier, SourcingEvidenceRecord } from './schema/types'
import { runReportCompiler } from './pipeline/run-report-compiler'
import { buildBomAdmissionGate, renderBomAdmissionGateCsv } from './scoring/bom-admission-gate'

const bessBrief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const candidate = await runReportCompiler({ id: 'audit-bom-admission-candidate', briefText: bessBrief })
  const candidateGate = buildBomAdmissionGate(candidate.dossier, candidate.architectureReadiness, candidate.stageTrace)
  const candidateCsv = renderBomAdmissionGateCsv(candidateGate)

  assert(candidateGate.verdict === 'candidate_bom_authorized', 'Unsourced BESS should admit only candidate BoM mode.')
  assert(candidateGate.summary.displayMode === 'candidate_only', 'Unsourced BESS should render as candidate-only BoM.')
  assert(candidateGate.summary.canRenderCandidateBom, 'Candidate-only BoM should be renderable.')
  assert(!candidateGate.summary.canRenderPricedBom, 'Unsourced BoM should not render as priced BoM.')
  assert(!candidateGate.summary.canUseForProcurement, 'No prototype BoM admission should imply procurement use.')
  assert(candidateCsv.split('\n')[0]?.includes('area,verdict,signal'), 'BoM admission CSV should include the expected header.')

  const protocol = await runReportCompiler({
    id: 'audit-bom-admission-protocol',
    briefText: bessBrief,
    sourcingEvidence: evidenceForCriticalLines(candidate.dossier, 'protocol'),
  })
  const protocolGate = buildBomAdmissionGate(protocol.dossier, protocol.architectureReadiness, protocol.stageTrace)

  assert(protocolGate.verdict === 'bom_admission_protocol_only', 'Protocol fixtures should admit only protocol-priced fixture mode.')
  assert(protocolGate.summary.displayMode === 'protocol_priced_fixture', 'Protocol fixtures should be labelled as protocol-priced fixture display.')
  assert(protocolGate.summary.canRenderPricedBom, 'Protocol-priced fixture rows can render as fixture evidence.')
  assert(!protocolGate.summary.canUseForProcurement, 'Protocol fixture BoM must not be procurement-ready.')

  const productionCritical = await runReportCompiler({
    id: 'audit-bom-admission-production-critical',
    briefText: bessBrief,
    sourcingEvidence: evidenceForCriticalLines(candidate.dossier, 'production'),
  })
  const productionGate = buildBomAdmissionGate(productionCritical.dossier, productionCritical.architectureReadiness, productionCritical.stageTrace)

  assert(productionGate.verdict === 'critical_bom_admitted', 'Production source evidence for every critical line should admit critical BoM mode.')
  assert(productionGate.summary.displayMode === 'critical_source_backed', 'Production critical evidence should set critical source-backed mode.')
  assert(productionGate.summary.pricedCriticalLines === productionGate.summary.criticalBomLines, 'All critical lines should be priced.')
  assert(productionGate.summary.productionReadySourcingEvidenceRows === productionCritical.dossier.sources.sourcingEvidence.length, 'All production critical source rows should be production-ready.')
  assert(!productionGate.summary.canUseForProcurement, 'Even critical source-backed prototype output still requires procurement review.')

  const broken = cloneDossier(candidate.dossier)
  broken.bom.lines[0] = {
    ...broken.bom.lines[0],
    unitCostGbp: 12,
    totalCostGbp: 12 * broken.bom.lines[0].quantity.value,
    supplier: 'Unprovenanced Supplier',
  }
  const brokenGate = buildBomAdmissionGate(broken, candidate.architectureReadiness, candidate.stageTrace)

  assert(brokenGate.verdict === 'bom_admission_blocked', 'Unprovenanced priced claims should block BoM admission.')
  assert(brokenGate.summary.displayMode === 'blocked', 'Broken BoM should be blocked from display admission.')
  assert(!brokenGate.summary.canRenderCandidateBom, 'Blocked BoM should not be display-authorized.')
  assert(brokenGate.summary.provenanceViolations > 0, 'Broken BoM should expose provenance violations.')

  console.log('BoM admission gate audit passed')
  console.log({
    candidate: candidateGate.summary,
    protocol: protocolGate.summary,
    productionCritical: productionGate.summary,
    broken: brokenGate.summary,
  })
}

function evidenceForCriticalLines(dossier: ProductDossier, kind: 'protocol' | 'production'): SourcingEvidenceRecord[] {
  return dossier.bom.lines
    .filter(line => line.critical)
    .map((line, index) => {
      const manufacturer = kind === 'protocol' ? 'Protocol Test Manufacturer' : 'Production Test Manufacturer'
      const mpn = `${kind === 'protocol' ? 'PROTOCOL' : 'PRODUCTION'}-${index + 1}-${line.componentWordId.toUpperCase().replaceAll(/[^A-Z0-9]+/g, '-')}`
      return {
        componentWordId: line.componentWordId,
        supplierName: kind === 'protocol' ? 'Protocol Test Supplier' : 'Production Test Supplier',
        manufacturer,
        mpn,
        unitCostGbp: 100 + index,
        leadTimeWeeks: 4 + index,
        sourceGrade: 'priced',
        evidence: {
          kind: 'source',
          ref: kind === 'protocol'
            ? `test-fixture://bom-admission/source/${line.componentWordId}`
            : `https://parts.vendor-catalogue.co.uk/items/${line.componentWordId}`,
          quote: `${manufacturer} ${mpn} sourced for ${line.description}.`,
        },
        retrievedAt: '2026-05-18T05:40:00.000+01:00',
      }
    })
}

function cloneDossier(dossier: ProductDossier): ProductDossier {
  return JSON.parse(JSON.stringify(dossier)) as ProductDossier
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
