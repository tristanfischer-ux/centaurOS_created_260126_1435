import { buildVerificationIntakeTemplate, dryRunVerificationIntake, type VerificationEvidenceDraft } from './architecture/verification-intake'
import { buildVerificationEvidenceLedger, renderVerificationEvidenceLedgerCsv } from './architecture/verification-ledger'
import { buildEngineeringVerificationPlan } from './architecture/verification-plan'
import { runReportCompiler } from './pipeline/run-report-compiler'

const brief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const result = await runReportCompiler({ id: 'audit-verification-ledger', briefText: brief })
  const plan = buildEngineeringVerificationPlan(result.dossier, result.architectureReadiness, result.issues)
  const template = buildVerificationIntakeTemplate(plan)
  const emptyLedger = buildVerificationEvidenceLedger(plan)
  const protocolDryRun = dryRunVerificationIntake(plan, [
    filledDraft(template.drafts[0], 'accepted'),
    filledDraft(template.drafts[1], 'rejected'),
    filledDraft(template.drafts[2], 'deferred'),
  ])
  const ledger = buildVerificationEvidenceLedger(plan, protocolDryRun.admittedRecords)
  const csv = renderVerificationEvidenceLedgerCsv(ledger)

  assert(emptyLedger.summary.accepted === 0, 'Empty ledger must not accept any engineering review activity.')
  assert(emptyLedger.summary.sourceEvidenceActivities === plan.summary.sourceEvidenceActivities, 'Ledger must preserve source-evidence activities for sourcing intake.')
  assert(protocolDryRun.validDrafts === 3, 'Protocol evidence should admit three non-source records.')
  assert(ledger.summary.accepted === 1, 'Ledger should count one accepted engineering review record.')
  assert(ledger.summary.rejected === 1, 'Ledger should count one rejected engineering review record.')
  assert(ledger.summary.deferred === 1, 'Ledger should count one deferred engineering review record.')
  assert(ledger.summary.reviewCoverageRatio > emptyLedger.summary.reviewCoverageRatio, 'Protocol evidence should increase review coverage.')
  assert(ledger.rows.some(row => row.ledgerStatus === 'source_evidence_required'), 'Ledger should keep BoM source evidence out of verification intake.')
  assert(csv.trim().split('\n').length === plan.summary.activities + 1, 'Verification ledger CSV should contain one header plus one row per activity.')

  console.log('Verification evidence ledger audit passed')
  console.log({
    empty: emptyLedger.summary,
    protocol: ledger.summary,
    csvRows: csv.trim().split('\n').length,
  })
}

function filledDraft(draft: VerificationEvidenceDraft, verdict: 'accepted' | 'rejected' | 'deferred'): VerificationEvidenceDraft {
  return {
    ...draft,
    reviewerName: 'Protocol Test Reviewer',
    verdict,
    evidenceRef: `test-fixture://verification-ledger/${draft.activityId}`,
    evidenceNote: 'Protocol-only fixture proving verification ledger accounting. Not a real engineering signoff.',
    reviewedAt: '2026-05-16T03:40:00.000+01:00',
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
