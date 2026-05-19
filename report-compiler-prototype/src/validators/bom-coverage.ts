import type { BomModel, ProductClass, SectionIssue } from '../schema/types'
import { issue } from '../schema/issues'
import { getClassPack } from '../class-packs'

export function validateBomCoverage(bom: BomModel, productClass: ProductClass): SectionIssue[] {
  const issues: SectionIssue[] = []
  const pack = getClassPack(productClass)
  const text = bom.lines.map(line => `${line.description} ${line.mpn ?? ''}`.toLowerCase()).join('\n')
  const missing = pack.requiredParts.filter(part => !part.match.some(token => text.includes(token.toLowerCase())))

  if (missing.length > 0) {
    issues.push(issue(
      'blocker',
      'missing_required_parts',
      `Missing ${missing.length}/${pack.requiredParts.length} class-required parts: ${missing.map(p => p.label).join(', ')}.`,
      'bom',
      'Add required class-pack parts before rendering procurement/cost claims.',
    ))
  }

  for (const line of bom.lines) {
    if (line.critical && (line.unitCostGbp === null || line.unitCostGbp < pack.minCriticalUnitCostGbp)) {
      issues.push(issue(
        'blocker',
        'critical_part_unpriced',
        `${line.description} is critical but has no credible unit cost.`,
        'bom',
        'Use distributor/catalogue price or class-pack floor estimate.',
        `bom.lines.${line.id}`,
      ))
    }
  }

  const pricedRatio = bom.coverage.totalLines === 0 ? 0 : bom.coverage.pricedLines / bom.coverage.totalLines
  if (pricedRatio < 0.8) {
    issues.push(issue(
      'major',
      'low_priced_line_ratio',
      `Only ${(pricedRatio * 100).toFixed(0)}% of BoM lines have prices.`,
      'bom',
      'Run sourcing and class-pack fallback before scoring.',
    ))
  }
  return issues
}

