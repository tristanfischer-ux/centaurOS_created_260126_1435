import type { SectionContract } from './contracts'
import type { FeasibilityModel } from '../schema/types'
import { issue } from '../schema/issues'

export const feasibilityContract: SectionContract<FeasibilityModel> = {
  id: 'feasibility_notes',
  title: 'Feasibility Notes',
  select: dossier => dossier.feasibility,
  minScoreInputs: {
    requiredFields: ['verdict', 'blockers', 'warnings', 'mitigationPlan', 'engineeringSanityChecks'],
    requiredEvidenceCount: 4,
    fatalIfMissing: ['verdict'],
  },
  validate(feasibility) {
    const issues = []
    if (feasibility.verdict === 'feasible' && feasibility.blockers.length > 0) {
      issues.push(issue(
        'blocker',
        'feasible_with_blockers',
        'Feasibility verdict says feasible while blockers exist.',
        'feasibility_notes',
        'Set verdict to conditional/not_feasible or resolve blockers.',
      ))
    }
    if (feasibility.mitigationPlan.length < feasibility.blockers.length) {
      issues.push(issue(
        'major',
        'missing_mitigations',
        'Not every feasibility blocker has a mitigation.',
        'feasibility_notes',
        'Add one specific mitigation per blocker.',
      ))
    }
    if (feasibility.engineeringSanityChecks.length === 0) {
      issues.push(issue(
        'major',
        'missing_engineering_sanity_checks',
        'No engineering sanity checks are attached to the feasibility model.',
        'feasibility_notes',
        'Run class-specific engineering sanity checks before reporting feasibility.',
      ))
    }
    const failedChecks = feasibility.engineeringSanityChecks.filter(check => check.status === 'fail')
    if (failedChecks.length > 0 && feasibility.verdict !== 'not_feasible') {
      issues.push(issue(
        'blocker',
        'failed_sanity_checks_not_blocking',
        `${failedChecks.length} engineering sanity check(s) failed without a not_feasible verdict.`,
        'feasibility_notes',
        'Set feasibility to not_feasible or resolve failed engineering sanity checks.',
      ))
    }
    return issues
  },
}
