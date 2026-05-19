import { buildProductClassCoverageMatrix, renderProductClassCoverageCsv } from './pipeline/product-class-coverage'
import { PRODUCT_CLASSES } from './schema/types'

async function main(): Promise<void> {
  const matrix = await buildProductClassCoverageMatrix()
  const csv = renderProductClassCoverageCsv(matrix)
  const deep = matrix.rows.filter(row => row.supportLevel === 'deep_scratch')
  const fallback = matrix.rows.filter(row => row.supportLevel === 'generic_fallback')
  const unknown = matrix.rows.filter(row => row.supportLevel === 'unknown_fallback')

  assert(matrix.rows.length === PRODUCT_CLASSES.length, 'Coverage matrix should include every product class enum value.')
  assert(deep.length === 10, 'BESS, heat pump, EV charger, bioreactor, AUV, edge AI, HAPS, CGM, vertical farm and drone should currently have deep scratch grammars.')
  assert(deep.every(row => row.componentCandidateCount > 0), 'Deep scratch rows should expose component candidates.')
  assert(deep.every(row => row.verdict === 'architecture_review_ready'), 'Deep scratch samples should be architecture-review-ready, not publishable while BoM evidence is missing.')
  assert(fallback.length === 0, 'No classified product class should currently be a generic fallback.')
  assert(fallback.every(row => row.verdict === 'blocked'), 'Generic fallback rows must be blocked from publishable status.')
  assert(fallback.every(row => row.blockingIssueCodes.includes('design_modules/unsupported_product_class_deep_grammar')), 'Generic fallback rows must name the missing deep grammar issue.')
  assert(unknown.length === 1, 'Unknown fallback should be represented once.')
  assert(unknown[0]?.blockingIssueCodes.includes('design_modules/unknown_product_class'), 'Unknown fallback should name the unknown-class issue.')
  assert(matrix.summary.publishableRows === 0, 'No product-class coverage row should be publishable without evidence.')
  assert(csv.trim().split('\n').length === matrix.rows.length + 1, 'Coverage CSV should contain one header plus one row per product class.')

  console.log('Product-class coverage audit passed')
  console.log({
    summary: matrix.summary,
    deep: deep.map(row => `${row.productClass}:${row.moduleCount}/${row.subModuleCount}/${row.componentCandidateCount}:${row.verdict}`),
    fallback: fallback.map(row => `${row.productClass}:${row.supportLevel}:${row.verdict}`),
    unknown: unknown.map(row => `${row.productClass}:${row.verdict}`),
    csvRows: csv.trim().split('\n').length,
  })
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

void main()
