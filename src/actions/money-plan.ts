'use server'

/**
 * Money Plan server actions.
 *
 * Reads plan_line_items for the /money/plan grid + minimal write paths for
 * archive. Full edit/create flows land in a follow-up PR (not MVP scope).
 */

import { revalidatePath } from 'next/cache'
import { withAuth } from '@/lib/server-action-utils'
import {
  buildActualsPnl,
  buildForecastPnl,
  buildVarianceReport,
  type PnlPeriod,
  type PnlReport,
  type XeroTransactionLite,
} from '@/lib/money/pnl'
import type { PlanLineItemRow } from '@/lib/money/runway'

export type PlanLineItem = {
  id: string
  name: string
  direction: 'out' | 'in'
  category: string
  amount_cents: number
  currency: string
  frequency: string
  effective_from: string
  effective_to: string | null
  probability_pct: number
  source: string
  notes: string | null
}

export type PlanData = {
  lines: PlanLineItem[]
  scenarios: Array<{ id: string; name: string; is_default: boolean }>
  activeScenarioId: string | null
}

export async function getPlanData(): Promise<PlanData | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { data: lineRows } = await supabase
      .from('plan_line_items')
      .select(
        'id, name, direction, category, amount_cents, currency, frequency, effective_from, effective_to, probability_pct, source, notes',
      )
      .eq('foundry_id', foundryId)
      .is('archived_at', null)
      .order('direction', { ascending: true })
      .order('category', { ascending: true })
      .order('amount_cents', { ascending: false })

    const lines: PlanLineItem[] = (lineRows ?? []) as PlanLineItem[]

    const { data: scenarios } = await supabase
      .from('money_scenarios')
      .select('id, name, is_default')
      .eq('foundry_id', foundryId)
      .is('archived_at', null)
      .order('is_default', { ascending: false })
      .order('name', { ascending: true })

    return {
      lines,
      scenarios: scenarios ?? [],
      activeScenarioId: scenarios?.find((s) => s.is_default)?.id ?? null,
    }
  })
}

export async function archivePlanLine(lineId: string): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { error } = await supabase
      .from('plan_line_items')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', lineId)
      .eq('foundry_id', foundryId)
    if (error) return { error: error.message }
    revalidatePath('/money/plan')
    revalidatePath('/money/cockpit')
    return { success: true as const }
  })
}

export async function seedPlanFromTemplate(templateId: string): Promise<{ success: true; inserted: number } | { error: string }> {
  return withAuth(async ({ supabase, foundryId, user }) => {
    const { data: tmpl } = await supabase
      .from('plan_templates')
      .select('line_items_seed, active')
      .eq('id', templateId)
      .maybeSingle()
    if (!tmpl?.active || !Array.isArray(tmpl.line_items_seed)) {
      return { error: 'Template not found or inactive' }
    }
    const seed = tmpl.line_items_seed as Array<Record<string, unknown>>
    const now = new Date()
    const effectiveFrom = now.toISOString().slice(0, 10)
    const rows = seed.map((s) => ({
      foundry_id: foundryId,
      name: (s.name as string) ?? 'Untitled',
      direction: (s.direction as 'out' | 'in') ?? 'out',
      category: (s.category as string) ?? 'other',
      amount_cents: (s.amount_cents as number) ?? 0,
      currency: 'GBP',
      frequency: (s.frequency as string) ?? 'monthly',
      effective_from: effectiveFrom,
      probability_pct: (s.probability_pct as number) ?? 100,
      source: 'template' as const,
      owner_user_id: user.id,
    }))
    const { error, data } = await supabase.from('plan_line_items').insert(rows).select('id')
    if (error) return { error: error.message }
    revalidatePath('/money/plan')
    revalidatePath('/money/cockpit')
    return { success: true as const, inserted: data?.length ?? 0 }
  })
}

// ============================================================================
// Single-line CRUD — drill-in editor / new-line / log-expense / send-invoice
// ============================================================================

export type PlanLineDetail = {
  id: string
  name: string
  direction: 'out' | 'in'
  category: string
  amount_cents: number
  currency: string
  frequency: 'one_off' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'variable'
  effective_from: string
  effective_to: string | null
  probability_pct: number
  notes: string | null
  source: string
  vat_treatment: string
  annual_uplift_pct: number
}

export type PlanLineCreateInput = {
  name: string
  direction: 'out' | 'in'
  category: string
  amount_cents: number
  frequency: 'one_off' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'variable'
  effective_from: string
  effective_to?: string | null
  probability_pct?: number
  notes?: string | null
  currency?: string
  source?: string
}

export type PlanLineUpdateInput = Partial<PlanLineCreateInput>

const VALID_DIRECTIONS = new Set(['out', 'in'])
const VALID_FREQUENCIES = new Set([
  'one_off',
  'weekly',
  'monthly',
  'quarterly',
  'annual',
  'variable',
])
const VALID_CATEGORIES = new Set([
  'people',
  'premises',
  'tools',
  'materials',
  'growth',
  'other',
  'revenue',
  'grants',
  'equity',
  'loans',
])

function validateLineInput(
  input: PlanLineCreateInput | PlanLineUpdateInput,
  isCreate: boolean,
): string | null {
  if (isCreate) {
    const i = input as PlanLineCreateInput
    if (!i.name?.trim()) return 'Name is required'
    if (!VALID_DIRECTIONS.has(i.direction)) return 'Direction must be out or in'
    if (!VALID_CATEGORIES.has(i.category)) return `Category "${i.category}" is not valid`
    if (!Number.isFinite(i.amount_cents) || i.amount_cents < 0) return 'Amount must be a non-negative number'
    if (!VALID_FREQUENCIES.has(i.frequency)) return 'Frequency is not valid'
    if (!i.effective_from) return 'Effective from date is required'
  } else {
    if (input.direction !== undefined && !VALID_DIRECTIONS.has(input.direction)) return 'Direction must be out or in'
    if (input.category !== undefined && !VALID_CATEGORIES.has(input.category)) return `Category "${input.category}" is not valid`
    if (input.amount_cents !== undefined && (!Number.isFinite(input.amount_cents) || input.amount_cents < 0)) return 'Amount must be a non-negative number'
    if (input.frequency !== undefined && !VALID_FREQUENCIES.has(input.frequency)) return 'Frequency is not valid'
  }
  if (input.probability_pct !== undefined && input.probability_pct !== null) {
    if (input.probability_pct < 0 || input.probability_pct > 100) return 'Probability must be 0–100'
  }
  return null
}

function isLineDirection(d: string): d is 'out' | 'in' {
  return d === 'out' || d === 'in'
}

function isLineFrequency(f: string): f is PlanLineDetail['frequency'] {
  return VALID_FREQUENCIES.has(f)
}

export async function getPlanLine(
  lineId: string,
): Promise<{ line: PlanLineDetail } | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { data, error } = await supabase
      .from('plan_line_items')
      .select(
        'id, name, direction, category, amount_cents, currency, frequency, effective_from, effective_to, probability_pct, notes, source, vat_treatment, annual_uplift_pct, foundry_id',
      )
      .eq('id', lineId)
      .maybeSingle()
    if (error) return { error: error.message }
    if (!data || data.foundry_id !== foundryId) return { error: 'Line not found' }
    if (!isLineDirection(data.direction)) return { error: 'Invalid line direction' }
    if (!isLineFrequency(data.frequency)) return { error: 'Invalid frequency' }
    return {
      line: {
        id: data.id,
        name: data.name,
        direction: data.direction,
        category: data.category,
        amount_cents: data.amount_cents,
        currency: data.currency,
        frequency: data.frequency,
        effective_from: data.effective_from,
        effective_to: data.effective_to,
        probability_pct: data.probability_pct,
        notes: data.notes,
        source: data.source,
        vat_treatment: data.vat_treatment,
        annual_uplift_pct: data.annual_uplift_pct,
      },
    }
  })
}

export async function createPlanLine(
  input: PlanLineCreateInput,
): Promise<{ id: string } | { error: string }> {
  return withAuth(async ({ supabase, foundryId, user }) => {
    const err = validateLineInput(input, true)
    if (err) return { error: err }
    const { data, error: insertErr } = await supabase
      .from('plan_line_items')
      .insert({
        foundry_id: foundryId,
        name: input.name.trim(),
        direction: input.direction,
        category: input.category,
        amount_cents: Math.round(input.amount_cents),
        currency: input.currency ?? 'GBP',
        frequency: input.frequency,
        effective_from: input.effective_from,
        effective_to: input.effective_to ?? null,
        probability_pct: input.probability_pct ?? 100,
        notes: input.notes ?? null,
        source: input.source ?? 'manual',
        owner_user_id: user.id,
      })
      .select('id')
      .single()
    if (insertErr || !data) return { error: insertErr?.message ?? 'Insert failed' }
    revalidatePath('/money/plan')
    revalidatePath('/money/cockpit')
    return { id: data.id }
  })
}

export async function updatePlanLine(
  lineId: string,
  input: PlanLineUpdateInput,
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    const err = validateLineInput(input, false)
    if (err) return { error: err }
    const update: Record<string, unknown> = {}
    if (input.name !== undefined) update.name = input.name.trim()
    if (input.direction !== undefined) update.direction = input.direction
    if (input.category !== undefined) update.category = input.category
    if (input.amount_cents !== undefined) update.amount_cents = Math.round(input.amount_cents)
    if (input.currency !== undefined) update.currency = input.currency
    if (input.frequency !== undefined) update.frequency = input.frequency
    if (input.effective_from !== undefined) update.effective_from = input.effective_from
    if (input.effective_to !== undefined) update.effective_to = input.effective_to
    if (input.probability_pct !== undefined) update.probability_pct = input.probability_pct
    if (input.notes !== undefined) update.notes = input.notes

    const { error } = await supabase
      .from('plan_line_items')
      .update(update)
      .eq('id', lineId)
      .eq('foundry_id', foundryId)
    if (error) return { error: error.message }
    revalidatePath('/money/plan')
    revalidatePath(`/money/plan/item/${lineId}`)
    revalidatePath('/money/cockpit')
    return { success: true as const }
  })
}

// ============================================================================
// Variance + P&L reports
// ============================================================================

export type VarianceReport = {
  forecast: PnlReport
  actuals: PnlReport
  variance: PnlReport
  asOfDate: string
}

async function loadPlanLinesForReports(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  foundryId: string,
): Promise<PlanLineItemRow[]> {
  const { data: rows } = await supabase
    .from('plan_line_items')
    .select(
      'id, direction, category, amount_cents, frequency, effective_from, effective_to, probability_pct, annual_uplift_pct',
    )
    .eq('foundry_id', foundryId)
    .is('archived_at', null)

  return (rows ?? []).map((r) => ({
    id: r.id,
    direction: r.direction === 'in' ? 'in' : 'out',
    category: r.category,
    amount_cents: r.amount_cents,
    frequency: r.frequency as PlanLineItemRow['frequency'],
    effective_from: r.effective_from,
    effective_to: r.effective_to,
    probability_pct: r.probability_pct,
    annual_uplift_pct: r.annual_uplift_pct ?? 0,
  }))
}

async function loadXeroTxForReports(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  foundryId: string,
  startDate: string,
): Promise<XeroTransactionLite[]> {
  const { data: rows } = await supabase
    .from('xero_transaction')
    .select('transaction_date, amount_cents, assigned_category, category_override')
    .eq('foundry_id', foundryId)
    .gte('transaction_date', startDate)
  return (rows ?? []).map((r) => ({
    transaction_date: r.transaction_date,
    amount_cents: r.amount_cents,
    assigned_category: r.assigned_category,
    category_override: r.category_override,
  }))
}

export async function getVarianceReport(
  periods = 6,
  period: PnlPeriod = 'month',
): Promise<VarianceReport | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    const asOf = new Date()
    // Anchor windows so forecast and actuals share the same period starts.
    const startWindow = new Date(asOf)
    // Shift back by `periods - 1` units to include earlier periods if desired.
    // For variance we look at the trailing window ending now: start at first day of (periods-1) periods ago.
    const monthsBack = period === 'month' ? periods - 1 : (periods - 1) * 3
    startWindow.setUTCMonth(startWindow.getUTCMonth() - monthsBack)
    startWindow.setUTCDate(1)
    const startDate = startWindow.toISOString().slice(0, 10)

    const [lines, txs] = await Promise.all([
      loadPlanLinesForReports(supabase, foundryId),
      loadXeroTxForReports(supabase, foundryId, startDate),
    ])

    const forecast = buildForecastPnl({
      lines,
      asOfDate: startWindow,
      periods,
      period,
    })
    const actuals = buildActualsPnl({
      transactions: txs,
      asOfDate: startWindow,
      periods,
      period,
    })
    const variance = buildVarianceReport(forecast, actuals)

    return {
      forecast,
      actuals,
      variance,
      asOfDate: asOf.toISOString().slice(0, 10),
    }
  })
}

export async function getForecastPnl(
  periods = 12,
  period: PnlPeriod = 'month',
): Promise<{ report: PnlReport } | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    const lines = await loadPlanLinesForReports(supabase, foundryId)
    const report = buildForecastPnl({
      lines,
      asOfDate: new Date(),
      periods,
      period,
    })
    return { report }
  })
}

// ============================================================================
// CSV import — V1 stub for the new Plan surface
// ============================================================================

export type PlanCsvPreviewRow = {
  rowNumber: number
  values: {
    name: string
    direction: 'out' | 'in'
    category: string
    amount_cents: number
    frequency: string
    effective_from: string
    probability_pct: number | null
    notes: string | null
  } | null
  errors: string[]
}

export type PlanCsvParseResult = {
  rows: PlanCsvPreviewRow[]
  validCount: number
  errorCount: number
}

const CSV_REQUIRED_COLUMNS = ['name', 'direction', 'category', 'amount', 'frequency', 'effective_from'] as const

function splitCsvRow(line: string): string[] {
  // Minimal CSV row splitter supporting quoted fields.
  const out: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuote = !inQuote
      }
    } else if (ch === ',' && !inQuote) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function parseAmountCents(raw: string): number | null {
  if (!raw) return null
  const stripped = raw.replace(/[£$€,\s]/g, '')
  const n = Number(stripped)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

function parseDateIso(raw: string): string | null {
  if (!raw) return null
  const s = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const uk = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (uk) {
    const dd = uk[1].padStart(2, '0')
    const mm = uk[2].padStart(2, '0')
    return `${uk[3]}-${mm}-${dd}`
  }
  return null
}

export async function parsePlanCsv(
  csvText: string,
): Promise<PlanCsvParseResult | { error: string }> {
  // No DB writes — pure parse. Wrap in withAuth anyway so unauthenticated
  // callers don't see the parser surface.
  return withAuth(async () => {
    const lines = csvText
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0)
    if (lines.length < 2) {
      return { error: 'CSV must contain a header row plus at least one data row' }
    }
    const header = splitCsvRow(lines[0]).map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))
    const missing = CSV_REQUIRED_COLUMNS.filter((c) => !header.includes(c))
    if (missing.length > 0) {
      return { error: `Missing required columns: ${missing.join(', ')}` }
    }
    if (lines.length - 1 > 500) {
      return { error: 'CSV exceeds 500 rows — split into smaller batches' }
    }

    const rows: PlanCsvPreviewRow[] = []
    let validCount = 0
    let errorCount = 0
    for (let i = 1; i < lines.length; i++) {
      const cells = splitCsvRow(lines[i])
      const map: Record<string, string> = {}
      for (let j = 0; j < header.length; j++) map[header[j]] = cells[j] ?? ''

      const errors: string[] = []
      const name = (map.name ?? '').trim()
      if (!name) errors.push('name is required')

      const direction = (map.direction ?? '').trim().toLowerCase()
      if (!VALID_DIRECTIONS.has(direction)) errors.push('direction must be out or in')

      const category = (map.category ?? '').trim().toLowerCase()
      if (!VALID_CATEGORIES.has(category)) errors.push(`category "${category}" not valid`)

      const amountCents = parseAmountCents(map.amount ?? '')
      if (amountCents === null) errors.push('amount is not a number')

      const frequency = (map.frequency ?? '').trim().toLowerCase()
      if (!VALID_FREQUENCIES.has(frequency)) errors.push('frequency not valid')

      const effectiveFrom = parseDateIso(map.effective_from ?? '')
      if (!effectiveFrom) errors.push('effective_from must be YYYY-MM-DD or DD/MM/YYYY')

      let probabilityPct: number | null = null
      const probRaw = (map.probability_pct ?? '').trim()
      if (probRaw) {
        const n = Number(probRaw.replace('%', ''))
        if (!Number.isFinite(n) || n < 0 || n > 100) errors.push('probability_pct must be 0-100')
        else probabilityPct = Math.round(n)
      }

      const valid = errors.length === 0 && amountCents !== null && effectiveFrom !== null
      if (valid) validCount++
      else errorCount++

      rows.push({
        rowNumber: i,
        values: valid
          ? {
              name,
              direction: direction as 'out' | 'in',
              category,
              amount_cents: amountCents!,
              frequency,
              effective_from: effectiveFrom!,
              probability_pct: probabilityPct,
              notes: (map.notes ?? '').trim() || null,
            }
          : null,
        errors,
      })
    }

    return { rows, validCount, errorCount }
  })
}

export async function confirmPlanCsvImport(
  rows: Array<{
    name: string
    direction: 'out' | 'in'
    category: string
    amount_cents: number
    frequency: string
    effective_from: string
    probability_pct: number | null
    notes: string | null
  }>,
): Promise<{ success: true; inserted: number } | { error: string }> {
  return withAuth(async ({ supabase, foundryId, user }) => {
    if (!Array.isArray(rows) || rows.length === 0) return { error: 'No rows to import' }
    if (rows.length > 500) return { error: 'Too many rows — max 500' }

    // Re-validate each row server-side; reject the batch on any failure.
    for (const r of rows) {
      const err = validateLineInput(
        {
          name: r.name,
          direction: r.direction,
          category: r.category,
          amount_cents: r.amount_cents,
          frequency: r.frequency as PlanLineCreateInput['frequency'],
          effective_from: r.effective_from,
          probability_pct: r.probability_pct ?? undefined,
        },
        true,
      )
      if (err) return { error: `Row ${r.name}: ${err}` }
    }

    const inserts = rows.map((r) => ({
      foundry_id: foundryId,
      name: r.name,
      direction: r.direction,
      category: r.category,
      amount_cents: Math.round(r.amount_cents),
      currency: 'GBP',
      frequency: r.frequency,
      effective_from: r.effective_from,
      probability_pct: r.probability_pct ?? 100,
      notes: r.notes,
      source: 'csv_import',
      owner_user_id: user.id,
    }))

    const { data, error } = await supabase.from('plan_line_items').insert(inserts).select('id')
    if (error) return { error: error.message }
    revalidatePath('/money/plan')
    revalidatePath('/money/cockpit')
    return { success: true as const, inserted: data?.length ?? 0 }
  })
}

