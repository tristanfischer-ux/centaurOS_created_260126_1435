import { runReportCompiler } from './pipeline/run-report-compiler'
import {
  buildSourcingIntakeTemplate,
  dryRunSourcingIntake,
  type SourcingEvidenceDraft,
} from './sourcing/intake'

const brief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const result = await runReportCompiler({ id: 'audit-sourcing-intake', briefText: brief })
  const template = buildSourcingIntakeTemplate(result.dossier)
  const emptyDryRun = dryRunSourcingIntake(result.dossier, template.drafts)
  const validDraft = filledDraft(template.drafts[0])
  const invalidDraft = { ...validDraft, componentWordId: 'missing_component', unitCostGbp: -1 }
  const protocolDryRun = dryRunSourcingIntake(result.dossier, [invalidDraft, validDraft])

  assert(template.drafts.length === result.dossier.sourcing.admission.unpricedCriticalLines, 'Template should contain one draft per unpriced critical line by default.')
  assert(template.drafts.every(draft => draft.supplierName === '' && draft.unitCostGbp === null && draft.evidence.ref === ''), 'Template should not contain admitted supplier or price claims.')
  assert(emptyDryRun.validDrafts === 0, 'Empty template dry-run should not admit any records.')
  assert(emptyDryRun.invalidDrafts === template.drafts.length, 'Empty template dry-run should reject all blank drafts.')
  assert(protocolDryRun.validDrafts === 1, 'Protocol dry-run should find one valid draft.')
  assert(protocolDryRun.invalidDrafts === 1, 'Protocol dry-run should reject one invalid draft.')
  assert(protocolDryRun.admission.admittedLines === 1, 'Protocol dry-run should admit one source-backed line.')
  assert(protocolDryRun.admission.unpricedCriticalLines === result.dossier.sourcing.admission.unpricedCriticalLines - 1, 'Protocol dry-run should reduce unpriced critical count by one.')

  console.log('Sourcing intake audit passed')
  console.log({
    templateDrafts: template.drafts.length,
    blankTemplate: {
      validDrafts: emptyDryRun.validDrafts,
      invalidDrafts: emptyDryRun.invalidDrafts,
      admittedLines: emptyDryRun.admission.admittedLines,
    },
    protocol: {
      validDrafts: protocolDryRun.validDrafts,
      invalidDrafts: protocolDryRun.invalidDrafts,
      admittedLines: protocolDryRun.admission.admittedLines,
      unpricedCriticalLines: protocolDryRun.admission.unpricedCriticalLines,
      rejectedDraft: protocolDryRun.draftRejections[0],
    },
  })
}

function filledDraft(draft: SourcingEvidenceDraft): SourcingEvidenceDraft {
  return {
    ...draft,
    supplierName: 'Protocol Test Supplier',
    manufacturer: 'Protocol Test Manufacturer',
    mpn: 'PROTOCOL-ONLY-NOT-A-REAL-PART',
    unitCostGbp: 75,
    leadTimeWeeks: 12,
    sourceGrade: 'priced',
    evidence: {
      kind: 'source',
      ref: `test-fixture://sourcing-intake/${draft.componentWordId}`,
      quote: 'Protocol-only fixture proving intake dry-run admission. Not a real supplier quote.',
    },
    retrievedAt: '2026-05-15T00:00:00.000Z',
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
