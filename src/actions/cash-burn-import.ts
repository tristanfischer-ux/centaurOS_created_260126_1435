'use server'

/**
 * @file cash-burn-import.ts — Import cash-out / cash-in rows from CSV or XLSX.
 *
 * Flow: user uploads file → `parseImportFile` returns validated preview rows →
 * user confirms → `commitImport` inserts the valid rows via existing batch actions.
 *
 * @security Reuses withAuth-equivalent guards via batch actions; foundry_id scoped.
 */

import ExcelJS from 'exceljs'
import { parseCsv } from '@/lib/cash-burn/csv-parser'
import { batchCreateCashOutItems, batchCreateCashInItems } from '@/actions/cash-burn-batch'
import type {
  ActionResult,
  CreateCashOutInput,
  CreateCashInInput,
  CostType,
  Frequency,
  CashInSourceType,
} from '@/types/cash-burn'

// ============================================================
// Types
// ============================================================

export type ImportKind = 'out' | 'in'

export interface ImportPreviewRow {
  /** 1-indexed row number in the source file (excluding header). */
  rowNumber: number
  /** Parsed values mirroring CreateCashOutInput / CreateCashInInput, stringly typed for UI. */
  values: Record<string, string | number | null>
  /** Field-level validation errors. Empty array = valid. */
  errors: string[]
}

export interface ImportParseResult {
  kind: ImportKind
  rows: ImportPreviewRow[]
  validCount: number
  errorCount: number
}

// ============================================================
// Constants
// ============================================================

const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2 MB
const MAX_ROWS = 1000

const COST_TYPES: ReadonlySet<string> = new Set(['fixed', 'variable'])
const SOURCE_TYPES: ReadonlySet<string> = new Set([
  'revenue', 'loan', 'equity', 'government_grant', 'other',
])

const FREQUENCY_ALIASES: Record<string, Frequency> = {
  weekly: 'weekly', week: 'weekly', wk: 'weekly',
  monthly: 'monthly', month: 'monthly', mo: 'monthly', 'per month': 'monthly',
  annual: 'annual', annually: 'annual', yearly: 'annual', year: 'annual', yr: 'annual',
  one_time: 'one_time', onetime: 'one_time', once: 'one_time', 'one-time': 'one_time',
}

const OUT_COLUMNS = ['name', 'category', 'cost_type', 'amount', 'frequency', 'effective_from', 'notes'] as const
const IN_COLUMNS = ['name', 'source_type', 'amount', 'frequency', 'effective_from', 'probability_pct', 'notes'] as const

// ============================================================
// Parsers
// ============================================================

function normaliseHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function parseAmount(raw: string): number | null {
  if (!raw) return null
  const stripped = raw.replace(/[£$€,\s]/g, '')
  const n = Number(stripped)
  return Number.isFinite(n) ? n : null
}

function parseFrequency(raw: string): Frequency | null {
  if (!raw) return null
  return FREQUENCY_ALIASES[raw.trim().toLowerCase()] ?? null
}

function parseDate(raw: string): string | null {
  if (!raw) return null
  const s = raw.trim()
  // ISO already
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // UK DD/MM/YYYY
  const uk = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (uk) {
    const dd = uk[1].padStart(2, '0')
    const mm = uk[2].padStart(2, '0')
    return `${uk[3]}-${mm}-${dd}`
  }
  // Excel serial date (number of days since 1900-01-01, with Excel's 1900 leap-year bug)
  const n = Number(s)
  if (Number.isFinite(n) && n > 25000 && n < 60000) {
    const base = new Date(Date.UTC(1899, 11, 30)) // Excel epoch accounting for 1900 bug
    const d = new Date(base.getTime() + n * 86400 * 1000)
    return d.toISOString().slice(0, 10)
  }
  return null
}

async function readFileToRows(file: File): Promise<string[][]> {
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.csv') || file.type === 'text/csv') {
    const text = await file.text()
    return parseCsv(text)
  }
  if (lower.endsWith('.xlsx') || file.type.includes('spreadsheetml')) {
    const buf = await file.arrayBuffer()
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    const ws = wb.worksheets[0]
    if (!ws) return []
    const rows: string[][] = []
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = []
      row.eachCell({ includeEmpty: true }, (cell) => {
        const v = cell.value
        if (v == null) cells.push('')
        else if (typeof v === 'object' && 'text' in v) cells.push(String((v as { text: unknown }).text ?? ''))
        else if (v instanceof Date) cells.push(v.toISOString().slice(0, 10))
        else cells.push(String(v))
      })
      rows.push(cells)
    })
    return rows
  }
  throw new Error('Unsupported file type — upload .csv or .xlsx')
}

// ============================================================
// Row validation
// ============================================================

interface ValidatedOutRow {
  input: CreateCashOutInput | null
  errors: string[]
}

function validateOutRow(r: Record<string, string>): ValidatedOutRow {
  const errors: string[] = []
  const name = (r.name ?? '').trim()
  if (!name) errors.push('name is required')
  if (name.length > 200) errors.push('name is too long (max 200)')

  const category = (r.category ?? '').trim() || 'other'

  const costTypeRaw = (r.cost_type ?? '').trim().toLowerCase()
  if (!COST_TYPES.has(costTypeRaw)) errors.push('cost_type must be fixed or variable')

  const amount = parseAmount(r.amount ?? '')
  if (amount === null) errors.push('amount is not a number')

  const frequency = parseFrequency(r.frequency ?? '')
  if (!frequency) errors.push('frequency must be weekly, monthly, annual or one_time')

  const effectiveFrom = parseDate(r.effective_from ?? '') ?? new Date().toISOString().slice(0, 10)

  if (errors.length > 0 || amount === null || !frequency) {
    return { input: null, errors }
  }

  return {
    input: {
      name,
      category,
      cost_type: costTypeRaw as CostType,
      amount,
      frequency,
      effective_from: effectiveFrom,
      notes: (r.notes ?? '').trim() || undefined,
    },
    errors,
  }
}

interface ValidatedInRow {
  input: CreateCashInInput | null
  errors: string[]
}

function validateInRow(r: Record<string, string>): ValidatedInRow {
  const errors: string[] = []
  const name = (r.name ?? '').trim()
  if (!name) errors.push('name is required')
  if (name.length > 200) errors.push('name is too long (max 200)')

  const sourceRaw = (r.source_type ?? '').trim().toLowerCase()
  if (!SOURCE_TYPES.has(sourceRaw)) {
    errors.push('source_type must be revenue, loan, equity, government_grant or other')
  }

  const amount = parseAmount(r.amount ?? '')
  if (amount === null) errors.push('amount is not a number')

  const frequency = parseFrequency(r.frequency ?? '')
  if (!frequency) errors.push('frequency must be weekly, monthly, annual or one_time')

  const effectiveFrom = parseDate(r.effective_from ?? '') ?? new Date().toISOString().slice(0, 10)

  let probability: number | undefined
  const probRaw = (r.probability_pct ?? '').trim()
  if (probRaw) {
    const n = Number(probRaw.replace('%', ''))
    if (!Number.isFinite(n) || n < 0 || n > 100) errors.push('probability_pct must be 0-100')
    else probability = Math.round(n)
  }

  if (errors.length > 0 || amount === null || !frequency) {
    return { input: null, errors }
  }

  return {
    input: {
      name,
      source_type: sourceRaw as CashInSourceType,
      amount,
      frequency,
      probability_pct: probability,
      effective_from: effectiveFrom,
      notes: (r.notes ?? '').trim() || undefined,
    },
    errors,
  }
}

// ============================================================
// Public server actions
// ============================================================

export async function parseImportFile(
  formData: FormData,
): Promise<ActionResult<ImportParseResult>> {
  try {
    const file = formData.get('file') as File | null
    const kindRaw = formData.get('kind')
    if (!file) return { data: null, error: 'No file uploaded' }
    if (kindRaw !== 'out' && kindRaw !== 'in') return { data: null, error: 'Invalid kind' }
    const kind = kindRaw as ImportKind

    if (file.size === 0) return { data: null, error: 'File is empty' }
    if (file.size > MAX_FILE_SIZE) {
      return { data: null, error: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024} MB` }
    }

    const rawRows = await readFileToRows(file)
    if (rawRows.length < 2) {
      return { data: null, error: 'File must contain a header row and at least one data row' }
    }
    if (rawRows.length - 1 > MAX_ROWS) {
      return { data: null, error: `Too many rows — max ${MAX_ROWS}` }
    }

    const header = rawRows[0].map(normaliseHeader)
    const expected = kind === 'out' ? OUT_COLUMNS : IN_COLUMNS
    const required = expected.filter(c => c !== 'notes' && c !== 'probability_pct')
    const missing = required.filter(c => !header.includes(c))
    if (missing.length > 0) {
      return { data: null, error: `Missing required columns: ${missing.join(', ')}` }
    }

    const preview: ImportPreviewRow[] = []
    let validCount = 0
    let errorCount = 0

    for (let i = 1; i < rawRows.length; i++) {
      const row = rawRows[i]
      if (row.every(c => c.trim() === '')) continue // skip blank lines
      const r: Record<string, string> = {}
      for (let j = 0; j < header.length; j++) {
        r[header[j]] = row[j] ?? ''
      }
      const v = kind === 'out' ? validateOutRow(r) : validateInRow(r)
      const errors = v.errors
      if (errors.length === 0) validCount++
      else errorCount++

      preview.push({
        rowNumber: i,
        values: v.input
          ? (kind === 'out'
              ? {
                  name: (v.input as CreateCashOutInput).name,
                  category: (v.input as CreateCashOutInput).category,
                  cost_type: (v.input as CreateCashOutInput).cost_type,
                  amount: (v.input as CreateCashOutInput).amount,
                  frequency: (v.input as CreateCashOutInput).frequency,
                  effective_from: (v.input as CreateCashOutInput).effective_from,
                  notes: (v.input as CreateCashOutInput).notes ?? null,
                }
              : {
                  name: (v.input as CreateCashInInput).name,
                  source_type: (v.input as CreateCashInInput).source_type,
                  amount: (v.input as CreateCashInInput).amount,
                  frequency: (v.input as CreateCashInInput).frequency,
                  probability_pct: (v.input as CreateCashInInput).probability_pct ?? null,
                  effective_from: (v.input as CreateCashInInput).effective_from,
                  notes: (v.input as CreateCashInInput).notes ?? null,
                })
          : { ...r },
        errors,
      })
    }

    return { data: { kind, rows: preview, validCount, errorCount }, error: null }
  } catch (err) {
    console.error('[cash-burn-import] parse failed:', err)
    const msg = err instanceof Error ? err.message : 'Parse failed'
    return { data: null, error: msg }
  }
}

export async function commitImport(
  kind: ImportKind,
  rows: Array<Record<string, string | number | null>>,
): Promise<ActionResult<{ inserted: number }>> {
  try {
    if (rows.length === 0) return { data: null, error: 'No rows to import' }
    if (rows.length > MAX_ROWS) return { data: null, error: `Too many rows — max ${MAX_ROWS}` }

    if (kind === 'out') {
      const inputs: CreateCashOutInput[] = rows.map(r => ({
        name: String(r.name ?? ''),
        category: String(r.category ?? 'other'),
        cost_type: String(r.cost_type ?? 'fixed') as CostType,
        amount: Number(r.amount ?? 0),
        frequency: String(r.frequency ?? 'monthly') as Frequency,
        effective_from: String(r.effective_from ?? new Date().toISOString().slice(0, 10)),
        notes: r.notes ? String(r.notes) : undefined,
      }))
      const res = await batchCreateCashOutItems(inputs)
      if (res.error) return { data: null, error: res.error }
      return { data: { inserted: res.data?.length ?? 0 }, error: null }
    }

    const inputs: CreateCashInInput[] = rows.map(r => ({
      name: String(r.name ?? ''),
      source_type: String(r.source_type ?? 'other') as CashInSourceType,
      amount: Number(r.amount ?? 0),
      frequency: String(r.frequency ?? 'monthly') as Frequency,
      probability_pct: r.probability_pct != null ? Number(r.probability_pct) : undefined,
      effective_from: String(r.effective_from ?? new Date().toISOString().slice(0, 10)),
      notes: r.notes ? String(r.notes) : undefined,
    }))
    const res = await batchCreateCashInItems(inputs)
    if (res.error) return { data: null, error: res.error }
    return { data: { inserted: res.data?.length ?? 0 }, error: null }
  } catch (err) {
    console.error('[cash-burn-import] commit failed:', err)
    const detail = err instanceof Error ? err.message : String(err)
    return { data: null, error: `Import failed: ${detail}` }
  }
}
