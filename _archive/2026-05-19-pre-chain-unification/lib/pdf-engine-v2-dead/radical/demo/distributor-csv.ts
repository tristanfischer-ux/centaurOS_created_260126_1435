/**
 * @file radical/demo/distributor-csv.ts
 *
 * Distributor CSV export for the BESS Radical demo.
 *
 * Outputs three CSV files:
 *   mouser-bom.csv    — Mouser BOM upload format
 *   digikey-bom.csv   — Digi-Key BOM import (MyLists) format
 *   farnell-bom.csv   — Farnell BOM upload format
 *
 * Each file contains only the leaves resolved to that distributor.
 *
 * Column specs:
 *   Mouser:   Quantity,MouserPartNumber,CustomerPartNumber,CustomerDescription
 *   Digi-Key: Quantity,Part Number,Customer Reference,Description
 *   Farnell:  Qty,Part Number,Description,Customer Part Number
 *
 * Reference:
 *   Mouser: https://www.mouser.com/bomtool/
 *   Digi-Key: https://www.digikey.co.uk/en/resources/conversion-calculators/conversion-calculator-bom-import
 *   Farnell: https://uk.farnell.com/bom-tool
 */

import type { ResolvedLeaf } from './resolution.js'

// ---------------------------------------------------------------------------
// CSV escape helper
// ---------------------------------------------------------------------------

function csvEscape(value: string | number | null): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  // If the value contains a comma, double-quote, or newline — wrap in quotes
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function csvRow(cells: (string | number | null)[]): string {
  return cells.map(csvEscape).join(',')
}

// ---------------------------------------------------------------------------
// Mouser BOM upload CSV
// Column order: Quantity,MouserPartNumber,CustomerPartNumber,CustomerDescription
// ---------------------------------------------------------------------------

export function buildMouserCsv(resolvedLeaves: ResolvedLeaf[]): string {
  const mousers = resolvedLeaves.filter(l => l.distributor === 'mouser' && l.mpn)

  const header = 'Quantity,MouserPartNumber,CustomerPartNumber,CustomerDescription'
  const rows: string[] = [header]

  for (const leaf of mousers) {
    rows.push(csvRow([
      leaf.qty,
      leaf.mpn,
      leaf.archetype_id,
      leaf.name,
    ]))
  }

  return rows.join('\n') + '\n'
}

// ---------------------------------------------------------------------------
// Digi-Key BOM import (MyLists) CSV
// Column order: Quantity,Part Number,Customer Reference,Description
// ---------------------------------------------------------------------------

export function buildDigikeyCsv(resolvedLeaves: ResolvedLeaf[]): string {
  const digikeys = resolvedLeaves.filter(l => l.distributor === 'digikey' && l.mpn)

  const header = 'Quantity,Part Number,Customer Reference,Description'
  const rows: string[] = [header]

  for (const leaf of digikeys) {
    rows.push(csvRow([
      leaf.qty,
      leaf.mpn,
      leaf.archetype_id,
      leaf.name,
    ]))
  }

  return rows.join('\n') + '\n'
}

// ---------------------------------------------------------------------------
// Farnell BOM upload CSV
// Column order: Qty,Part Number,Description,Customer Part Number
// ---------------------------------------------------------------------------

export function buildFarnellCsv(resolvedLeaves: ResolvedLeaf[]): string {
  const farnells = resolvedLeaves.filter(l => l.distributor === 'farnell' && l.mpn)

  const header = 'Qty,Part Number,Description,Customer Part Number'
  const rows: string[] = [header]

  for (const leaf of farnells) {
    rows.push(csvRow([
      leaf.qty,
      leaf.mpn,
      leaf.name,
      leaf.archetype_id,
    ]))
  }

  return rows.join('\n') + '\n'
}

// ---------------------------------------------------------------------------
// CSV validation helper
// ---------------------------------------------------------------------------

export interface CsvValidationResult {
  distributor: string
  lines: number          // data rows (excluding header)
  header_fields: number
  all_rows_valid: boolean
  error: string | null
}

export function validateCsv(csv: string, distributor: string): CsvValidationResult {
  const rows = csv.trim().split('\n')
  if (rows.length === 0) {
    return { distributor, lines: 0, header_fields: 0, all_rows_valid: false, error: 'Empty CSV' }
  }

  const header = rows[0]
  const headerFields = header.split(',').length
  const dataRows = rows.slice(1).filter(r => r.trim().length > 0)

  // Validate each data row has the same field count as header
  // (after accounting for quoted commas — simplified check)
  const invalid: number[] = []
  for (let i = 0; i < dataRows.length; i++) {
    // Count unquoted commas
    let count = 0
    let inQuote = false
    for (const ch of dataRows[i]) {
      if (ch === '"') inQuote = !inQuote
      if (ch === ',' && !inQuote) count++
    }
    const fields = count + 1
    if (fields !== headerFields) {
      invalid.push(i + 2) // 1-indexed, +1 for header
    }
  }

  return {
    distributor,
    lines: dataRows.length,
    header_fields: headerFields,
    all_rows_valid: invalid.length === 0,
    error: invalid.length > 0 ? `Rows with wrong field count: ${invalid.join(', ')}` : null,
  }
}

// ---------------------------------------------------------------------------
// Summary of all three CSVs
// ---------------------------------------------------------------------------

export function buildAllCsvs(resolvedLeaves: ResolvedLeaf[]): {
  mouser: string
  digikey: string
  farnell: string
} {
  return {
    mouser: buildMouserCsv(resolvedLeaves),
    digikey: buildDigikeyCsv(resolvedLeaves),
    farnell: buildFarnellCsv(resolvedLeaves),
  }
}
