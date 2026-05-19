import type { SectionContract } from './contracts'
import type { KeyMetric, ProductDossier } from '../schema/types'
import { issue } from '../schema/issues'
import { validateMetricArithmetic } from '../validators/arithmetic'

export const executiveSummaryContract: SectionContract<KeyMetric[]> = {
  id: 'executive_summary',
  title: 'Executive Summary',
  select: dossier => dossier.keyMetrics,
  minScoreInputs: {
    requiredFields: ['headline_output', 'capex', 'opex', 'payback'],
    requiredEvidenceCount: 3,
    fatalIfMissing: ['headline_output'],
  },
  validate(metrics, dossier: ProductDossier) {
    const issues = validateMetricArithmetic(dossier)
    const ids = new Set(metrics.map(m => m.id))
    if (!ids.has('headline_output')) {
      issues.push(issue(
        'blocker',
        'missing_headline_output',
        'Executive summary lacks a headline output metric.',
        'executive_summary',
        'Generate a product-class-specific output metric before rendering.',
      ))
    }
    if (!ids.has('capex_gbp')) {
      issues.push(issue(
        'major',
        'missing_capex_metric',
        'Executive summary lacks a CAPEX metric.',
        'executive_summary',
        'Propagate cost.capexGbp into keyMetrics.',
      ))
    }
    return issues
  },
}

