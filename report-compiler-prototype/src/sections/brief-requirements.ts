import type { SectionContract } from './contracts'
import type { ProductDossier } from '../schema/types'
import { issue } from '../schema/issues'

export const briefRequirementsContract: SectionContract<ProductDossier> = {
  id: 'brief_requirements',
  title: 'Brief Requirements',
  select: dossier => dossier,
  minScoreInputs: {
    requiredFields: ['brief.requirements', 'requirementTrace'],
    requiredEvidenceCount: 1,
    fatalIfMissing: ['requirementTrace'],
  },
  validate(dossier) {
    const issues = []
    if (dossier.brief.requirements.length === 0) {
      issues.push(issue(
        'minor',
        'no_quantified_requirements',
        'No quantified brief requirements were parsed.',
        'brief_requirements',
        'Extract at least one measurable requirement or record why the brief is qualitative only.',
        'brief.requirements',
      ))
    }
    if (dossier.requirementTrace.length !== dossier.brief.requirements.length) {
      issues.push(issue(
        'major',
        'requirement_trace_count_mismatch',
        `Requirement trace has ${dossier.requirementTrace.length} rows for ${dossier.brief.requirements.length} parsed requirements.`,
        'brief_requirements',
        'Build one trace row for each parsed requirement.',
        'requirementTrace',
      ))
    }
    for (const trace of dossier.requirementTrace) {
      if (trace.status === 'uncovered') {
        issues.push(issue(
          'major',
          'requirement_uncovered',
          `${trace.label} is not covered by the architecture.`,
          'brief_requirements',
          'Connect the requirement to at least one module/submodule or mark it out of scope with evidence.',
          `requirementTrace.${trace.requirementId}`,
        ))
      }
      if (trace.status === 'partial') {
        issues.push(issue(
          'minor',
          'requirement_partially_covered',
          `${trace.label} has architecture coverage but no metric or engineering sanity coverage.`,
          'brief_requirements',
          'Add a key metric or sanity check that evaluates this requirement.',
          `requirementTrace.${trace.requirementId}`,
        ))
      }
    }
    return issues
  },
}
