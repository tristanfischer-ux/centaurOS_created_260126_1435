import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { compileBriefToArtifacts, readSourcingEvidenceCsv, readVerificationEvidenceCsv } from './compile-brief'
import { buildEngineeringVerificationPlan } from './architecture/verification-plan'
import { buildVerificationEvidenceLedger } from './architecture/verification-ledger'
import { renderVerificationIntakeTemplateCsv, type VerificationEvidenceDraft, type VerificationIntakeTemplate } from './architecture/verification-intake'
import { renderSourcingIntakeTemplateCsv, type SourcingEvidenceDraft, type SourcingIntakeTemplate } from './sourcing/intake'
import type { ReportRunResult } from './schema/types'

const briefText = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const root = resolve('report-compiler-prototype/out/audit-csv-roundtrip')
  await mkdir(root, { recursive: true })

  const initial = await compileBriefToArtifacts({
    id: 'audit-csv-roundtrip-initial',
    title: 'Audit CSV Roundtrip Initial',
    briefText,
    outDir: join(root, 'initial'),
    writePdf: false,
  })

  const sourcingTemplate = JSON.parse(await readFile(initial.artifacts.sourcingIntakeTemplatePath, 'utf8')) as SourcingIntakeTemplate
  const verificationTemplate = JSON.parse(await readFile(initial.artifacts.verificationIntakeTemplatePath, 'utf8')) as VerificationIntakeTemplate
  const sourcingCsvPath = join(root, 'filled-sourcing.csv')
  const verificationCsvPath = join(root, 'filled-verification.csv')
  await writeFile(sourcingCsvPath, renderSourcingIntakeTemplateCsv({
    ...sourcingTemplate,
    drafts: [filledSourcingDraft(sourcingTemplate.drafts[0]), ...sourcingTemplate.drafts.slice(1)],
  }), 'utf8')
  await writeFile(verificationCsvPath, renderVerificationIntakeTemplateCsv({
    ...verificationTemplate,
    drafts: [filledVerificationDraft(verificationTemplate.drafts[0]), ...verificationTemplate.drafts.slice(1)],
  }), 'utf8')

  const sourcingEvidence = await readSourcingEvidenceCsv(sourcingCsvPath)
  const verificationEvidence = await readVerificationEvidenceCsv(verificationCsvPath)

  assert(sourcingEvidence.length === 1, 'Filled sourcing CSV should emit one evidence record and ignore blank template rows.')
  assert(verificationEvidence.length === 1, 'Filled verification CSV should emit one evidence record and ignore blank template rows.')

  const compiled = await compileBriefToArtifacts({
    id: 'audit-csv-roundtrip-admitted',
    title: 'Audit CSV Roundtrip Admitted',
    briefText,
    outDir: join(root, 'admitted'),
    writePdf: false,
    sourcingEvidence,
    verificationEvidence,
  })

  const state = JSON.parse(await readFile(compiled.artifacts.jsonPath, 'utf8')) as ReportRunResult
  const readiness = JSON.parse(await readFile(compiled.artifacts.readinessGatePath, 'utf8')) as {
    summary: { verificationAcceptedActivities: number; verificationEvidenceEligibleActivities: number }
    promotionBlockers: string[]
  }
  const provenance = JSON.parse(await readFile(compiled.artifacts.bomProvenanceManifestPath, 'utf8')) as {
    summary: { sourceBackedClaims: number; provenanceViolations: number; criticalMissingSourceClaims: number }
  }
  const plan = buildEngineeringVerificationPlan(state.dossier, state.architectureReadiness, state.issues)
  const verificationLedger = buildVerificationEvidenceLedger(plan, verificationEvidence)

  assert(state.dossier.sourcing.admission.admittedLines === 1, 'CSV-fed source evidence should admit one priced BoM line.')
  assert(state.dossier.sourcing.admission.unpricedCriticalLines === sourcingTemplate.drafts.length - 1, 'CSV-fed source evidence should reduce unpriced critical count by one.')
  assert(state.dossier.bom.lines.some(line => line.componentWordId === sourcingEvidence[0].componentWordId && line.unitCostGbp === 75 && line.supplier === 'Protocol CSV Supplier'), 'Admitted CSV source evidence should populate only its matching BoM line.')
  assert(provenance.summary.sourceBackedClaims === 5, 'One CSV source record should create five source-backed BoM provenance claims.')
  assert(provenance.summary.provenanceViolations === 0, 'CSV source record should not create provenance violations.')
  assert(readiness.summary.verificationAcceptedActivities === 1, 'CSV-fed verification evidence should count one accepted reviewer activity.')
  assert(readiness.summary.verificationAcceptedActivities < readiness.summary.verificationEvidenceEligibleActivities, 'One accepted reviewer activity should not make the report publishable.')
  assert(readiness.promotionBlockers.some(blocker => blocker.includes('non-sourcing verification')), 'Readiness should still block on remaining unaccepted verification activities.')
  assert(verificationLedger.summary.accepted === 1, 'Verification ledger should accept exactly the one CSV reviewer record.')

  console.log('Intake CSV roundtrip audit passed')
  console.log({
    sourcingCsvPath,
    verificationCsvPath,
    admittedHtml: compiled.htmlPath,
    admittedLines: state.dossier.sourcing.admission.admittedLines,
    sourceBackedClaims: provenance.summary.sourceBackedClaims,
    verificationAccepted: `${readiness.summary.verificationAcceptedActivities}/${readiness.summary.verificationEvidenceEligibleActivities}`,
  })
}

function filledSourcingDraft(draft: SourcingEvidenceDraft): SourcingEvidenceDraft {
  return {
    ...draft,
    supplierName: 'Protocol CSV Supplier',
    manufacturer: 'Protocol CSV Manufacturer',
    mpn: 'PROTOCOL-CSV-NOT-A-REAL-PART',
    unitCostGbp: 75,
    leadTimeWeeks: 12,
    sourceGrade: 'priced',
    evidence: {
      kind: 'source',
      ref: `test-fixture://csv-sourcing/${draft.componentWordId}`,
      quote: 'Protocol-only CSV fixture proving source-backed intake. Not a real supplier quote.',
    },
    retrievedAt: '2026-05-17T00:00:00.000+01:00',
  }
}

function filledVerificationDraft(draft: VerificationEvidenceDraft): VerificationEvidenceDraft {
  return {
    ...draft,
    reviewerName: 'Protocol CSV Reviewer',
    verdict: 'accepted',
    evidenceRef: `test-fixture://csv-verification/${draft.activityId}`,
    evidenceNote: 'Protocol-only CSV fixture proving reviewer evidence intake. Not a real engineering signoff.',
    reviewedAt: '2026-05-17T00:00:00.000+01:00',
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
