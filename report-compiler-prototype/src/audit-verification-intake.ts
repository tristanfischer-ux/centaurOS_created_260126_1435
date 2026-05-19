import {
  buildVerificationIntakeTemplate,
  dryRunVerificationIntake,
  renderEngineeringVerificationPlanCsv,
  type VerificationEvidenceDraft,
} from './architecture/verification-intake'
import { buildEngineeringVerificationPlan } from './architecture/verification-plan'
import { runReportCompiler } from './pipeline/run-report-compiler'

const brief = 'Design a containerised 3.5 MWh battery energy storage system with 1 MW PCS, 28 tonne gross mass limit, and LFP prismatic cells.'

async function main(): Promise<void> {
  const result = await runReportCompiler({ id: 'audit-verification-intake', briefText: brief })
  const plan = buildEngineeringVerificationPlan(result.dossier, result.architectureReadiness, result.issues)
  const template = buildVerificationIntakeTemplate(plan)
  const sourceTemplate = buildVerificationIntakeTemplate(plan, true)
  const emptyDryRun = dryRunVerificationIntake(plan, template.drafts)
  const validDraft = filledDraft(template.drafts[0])
  const invalidDraft = { ...validDraft, activityId: 'missing_activity', evidenceRef: '' }
  const sourceDraft = filledDraft(sourceTemplate.drafts.find(draft => draft.evidenceKind === 'source_evidence') ?? sourceTemplate.drafts[0])
  const protocolDryRun = dryRunVerificationIntake(plan, [invalidDraft, sourceDraft, validDraft])
  const csv = renderEngineeringVerificationPlanCsv(plan)

  assert(template.includeSourceEvidence === false, 'Default verification intake should exclude source-evidence activities.')
  assert(template.drafts.length === plan.summary.activities - plan.summary.sourceEvidenceActivities, 'Default intake should include only non-source verification activities.')
  assert(template.drafts.every(draft => draft.evidenceKind !== 'source_evidence'), 'Default intake should not include source-evidence drafts.')
  assert(sourceTemplate.drafts.some(draft => draft.evidenceKind === 'source_evidence'), 'Explicit source template should expose source-evidence drafts for rejection testing.')
  assert(emptyDryRun.validDrafts === 0, 'Blank verification template dry-run should not admit any records.')
  assert(emptyDryRun.invalidDrafts === template.drafts.length, 'Blank verification template dry-run should reject all drafts.')
  assert(protocolDryRun.validDrafts === 1, 'Protocol dry-run should admit one valid non-source verification record.')
  assert(protocolDryRun.invalidDrafts === 2, 'Protocol dry-run should reject one missing activity and one source-evidence record.')
  assert(protocolDryRun.accepted === 1, 'Protocol dry-run should count one accepted record.')
  assert(protocolDryRun.draftRejections.some(rejection => rejection.reasons.some(reason => reason.includes('source_evidence must be admitted'))), 'Protocol dry-run should explain source evidence belongs to sourcing intake.')
  assert(csv.trim().split('\n').length === plan.summary.activities + 1, 'Verification plan CSV should contain one header plus one row per activity.')

  console.log('Verification intake audit passed')
  console.log({
    planSummary: plan.summary,
    templateDrafts: template.drafts.length,
    blankTemplate: {
      validDrafts: emptyDryRun.validDrafts,
      invalidDrafts: emptyDryRun.invalidDrafts,
    },
    protocol: {
      validDrafts: protocolDryRun.validDrafts,
      invalidDrafts: protocolDryRun.invalidDrafts,
      accepted: protocolDryRun.accepted,
      rejectedActivityIds: protocolDryRun.draftRejections.map(rejection => rejection.activityId),
    },
    csvRows: csv.trim().split('\n').length,
  })
}

function filledDraft(draft: VerificationEvidenceDraft): VerificationEvidenceDraft {
  return {
    ...draft,
    reviewerName: 'Protocol Test Reviewer',
    verdict: 'accepted',
    evidenceRef: `test-fixture://verification-intake/${draft.activityId}`,
    evidenceNote: 'Protocol-only fixture proving verification evidence intake. Not a real engineering signoff.',
    reviewedAt: '2026-05-16T00:00:00.000+01:00',
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
