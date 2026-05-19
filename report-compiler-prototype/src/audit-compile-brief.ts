import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { compileBriefToArtifacts } from './compile-brief'

async function main(): Promise<void> {
  const outDir = resolve('report-compiler-prototype/out/audit-single-brief')
  const compiled = await compileBriefToArtifacts({
    id: 'audit-single-brief',
    title: 'Audit Single Brief',
    briefText: 'Design a 120 kW DC fast EV charger with CCS2 cable, OCPP backend, ISO 15118 communication, MID metering, insulation monitoring, emergency stop and outdoor cabinet.',
    outDir,
    writePdf: false,
  })

  assert(compiled.productClass === 'ev_charger', `Single-brief compiler should classify EV charger, got ${compiled.productClass}.`)
  assert(compiled.verdict === 'architecture_review_ready', `Unsourced EV charger should be architecture_review_ready, got ${compiled.verdict}.`)
  await Promise.all([
    mustExist(compiled.indexPath),
    mustExist(compiled.artifacts.htmlPath),
    mustExist(compiled.artifacts.jsonPath),
    mustExist(compiled.artifacts.engineeringCalculationsPath),
    mustExist(compiled.artifacts.engineeringAssumptionsPath),
    mustExist(compiled.artifacts.sourcingIntakeTemplatePath),
    mustExist(compiled.artifacts.sourceReferenceQualityGatePath),
    mustExist(compiled.artifacts.bomEvidenceTracePath),
    mustExist(compiled.artifacts.bomEvidenceClosurePlanPath),
    mustExist(compiled.artifacts.sourcingBatchPlanPath),
    mustExist(compiled.artifacts.procurementReadinessGatePath),
    mustExist(compiled.artifacts.verificationIntakeTemplatePath),
    mustExist(compiled.artifacts.readinessGatePath),
    mustExist(compiled.artifacts.architectureFreezeGatePath),
    mustExist(compiled.artifacts.architectureFreezeClosurePlanPath),
    mustExist(compiled.artifacts.subModuleEngineeringGatePath),
  ])

  const state = JSON.parse(await readFile(compiled.artifacts.jsonPath, 'utf8')) as {
    dossier?: {
      sourcing?: { admission?: { status?: string; admittedLines?: number } }
      bom?: { lines?: Array<{ unitCostGbp: number | null; supplier?: string; manufacturer?: string; mpn?: string }> }
    }
  }
  assert(state.dossier?.sourcing?.admission?.status === 'not_started', 'Single-brief compiler should not start sourcing without evidence.')
  assert(state.dossier?.sourcing?.admission?.admittedLines === 0, 'Single-brief compiler should not admit priced lines without evidence.')
  assert(state.dossier?.bom?.lines?.every(line => line.unitCostGbp === null && !line.supplier && !line.manufacturer && !line.mpn), 'Unsourced BoM lines should not contain supplier/manufacturer/MPN/cost claims.')

  const index = await readFile(compiled.indexPath, 'utf8')
  assert(index.includes('Verdict'), 'Single-brief index should include the dashboard header.')
  assert(index.includes('architecture_review_ready'), 'Single-brief index should show readiness verdict in dashboard.')
  assert(index.includes('ev_charger'), 'Single-brief index should show classified product class in dashboard.')
  assert(index.includes('Evidence Gaps'), 'Single-brief index should show evidence gap count in dashboard.')
  assert(index.includes('Source-backed Claims'), 'Single-brief index should show source-backed claim count in dashboard.')
  assert(index.includes('Source reference quality'), 'Single-brief index should link source-reference quality gate.')
  assert(index.includes('BoM evidence trace'), 'Single-brief index should link BoM evidence trace.')
  assert(index.includes('BoM evidence closure'), 'Single-brief index should link BoM evidence closure plan.')
  assert(index.includes('Sourcing batch plan'), 'Single-brief index should link sourcing batch plan.')
  assert(index.includes('Procurement readiness gate'), 'Single-brief index should link procurement readiness gate.')
  assert(index.includes('Engineering calculations'), 'Single-brief index should link engineering calculations.')
  assert(index.includes('Engineering assumptions'), 'Single-brief index should link engineering assumptions.')
  assert(index.includes('Sourcing worklist'), 'Single-brief index should link sourcing worklist.')
  assert(index.includes('Architecture freeze'), 'Single-brief index should link architecture freeze gate.')
  assert(index.includes('Freeze closure plan'), 'Single-brief index should link architecture freeze closure plan.')
  assert(index.includes('Submodule engineering gate'), 'Single-brief index should link submodule engineering gate.')

  console.log('Single-brief compiler audit passed')
  console.log({
    productClass: compiled.productClass,
    verdict: compiled.verdict,
    indexPath: compiled.indexPath,
    htmlPath: compiled.htmlPath,
  })
}

async function mustExist(path: string): Promise<void> {
  await access(path)
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
