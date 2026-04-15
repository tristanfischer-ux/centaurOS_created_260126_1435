/**
 * @file route.ts — Download a blank CSV import template for cash-out or cash-in.
 *
 * Usage: /api/cash-burn/import-template?kind=out | in
 */

import { NextRequest, NextResponse } from 'next/server'
import { buildCsv } from '@/lib/cash-burn/csv-parser'

const OUT_HEADER = ['name', 'category', 'cost_type', 'amount', 'frequency', 'effective_from', 'notes']
const IN_HEADER = ['name', 'source_type', 'amount', 'frequency', 'effective_from', 'probability_pct', 'notes']

// Category values must match the CHECK constraint in migration
// 20260226150000_cash_burn_planning.sql (public.cash_out_items.category).
// Valid options: rent, salaries, benefits_insurance, phone_internet, ai_llm,
// saas_subscriptions, insurance, accounting, legal_retainer, bank_fees,
// contractors, hardware_components, prototyping, manufacturing, shipping,
// marketing, travel, events, cloud_infrastructure, r_and_d,
// equipment_purchase, other.
const OUT_EXAMPLES: (string | number)[][] = [
  ['Office rent', 'rent', 'fixed', 1500, 'monthly', '2026-01-01', 'Serviced office'],
  ['AWS hosting', 'cloud_infrastructure', 'fixed', 120, 'monthly', '2026-01-01', ''],
  ['Prototype parts', 'prototyping', 'variable', 3500, 'one_time', '2026-02-15', 'Batch 2'],
]

const IN_EXAMPLES: (string | number)[][] = [
  ['SaaS subscription revenue', 'revenue', 8000, 'monthly', '2026-03-01', 80, 'Tier 1 customers'],
  ['Innovate UK grant', 'government_grant', 47300, 'one_time', '2026-04-01', 100, ''],
  ['SEIS round', 'equity', 500000, 'one_time', '2026-06-01', 50, 'First close'],
]

export async function GET(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get('kind')
  if (kind !== 'out' && kind !== 'in') {
    return NextResponse.json({ error: 'kind must be "out" or "in"' }, { status: 400 })
  }
  const header = kind === 'out' ? OUT_HEADER : IN_HEADER
  const examples = kind === 'out' ? OUT_EXAMPLES : IN_EXAMPLES
  const csv = buildCsv([header, ...examples])
  const filename = `cash-${kind}-template.csv`
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
