import type { BomModel, SectionIssue } from '../schema/types'
import { issue } from '../schema/issues'

export function validateBomProvenance(bom: BomModel): SectionIssue[] {
  const issues: SectionIssue[] = []
  for (const line of bom.lines) {
    if (line.provenance.length === 0) {
      issues.push(issue(
        'major',
        'bom_line_missing_provenance',
        `${line.description} has no provenance.`,
        'bom',
        'Attach source, formula, model, or class-pack provenance to each BoM row.',
        `bom.lines.${line.id}`,
      ))
    }
  }
  return issues
}

