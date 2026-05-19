import type { ProductDossier, SectionIssue } from '../schema/types'
import { issue } from '../schema/issues'

export function validateMetricArithmetic(dossier: ProductDossier): SectionIssue[] {
  const issues: SectionIssue[] = []
  for (const metric of dossier.keyMetrics) {
    if (!metric.formula || !metric.inputs || typeof metric.value !== 'number') continue
    const computed = evaluateFormula(metric.formula, metric.inputs)
    if (!Number.isFinite(computed)) continue
    if (!approximatelyEqual(metric.value, computed, 0.02)) {
      issues.push(issue(
        'major',
        'metric_arithmetic_mismatch',
        `${metric.label} does not match formula ${metric.formula}; expected ${computed}, got ${metric.value}.`,
        'executive_summary',
        'Update structured inputs or the metric value; do not patch prose only.',
        `keyMetrics.${metric.id}`,
      ))
    }
  }
  return issues
}

export function approximatelyEqual(a: number, b: number, toleranceRatio: number): boolean {
  if (a === b) return true
  const scale = Math.max(Math.abs(a), Math.abs(b), 1)
  return Math.abs(a - b) / scale <= toleranceRatio
}

function evaluateFormula(formula: string, inputs: Record<string, number>): number {
  const compact = formula.replace(/\s+/g, '')
  const terms = compact.split('*')
  if (terms.length < 2) return Number.NaN
  let product = 1
  for (const term of terms) {
    const value = inputs[term]
    if (typeof value !== 'number') return Number.NaN
    product *= value
  }
  return product
}

