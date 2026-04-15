/**
 * @file csv-parser.ts — Minimal RFC-4180 CSV parser.
 *
 * Handles: commas in quoted fields, escaped quotes ("" → "), CRLF + LF line endings,
 * trailing empty lines. Does not handle: multiline fields (rare in finance exports).
 */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }
    if (ch === ',') {
      cur.push(field)
      field = ''
      i++
      continue
    }
    if (ch === '\n' || ch === '\r') {
      cur.push(field)
      field = ''
      if (cur.length > 1 || cur[0] !== '') rows.push(cur)
      cur = []
      if (ch === '\r' && text[i + 1] === '\n') i += 2
      else i++
      continue
    }
    field += ch
    i++
  }
  if (field !== '' || cur.length > 0) {
    cur.push(field)
    if (cur.length > 1 || cur[0] !== '') rows.push(cur)
  }
  return rows
}

export function buildCsv(rows: (string | number)[][]): string {
  return rows
    .map(row =>
      row
        .map(cell => {
          const s = String(cell ?? '')
          if (s.includes(',') || s.includes('"') || s.includes('\n')) {
            return `"${s.replace(/"/g, '""')}"`
          }
          return s
        })
        .join(','),
    )
    .join('\n')
}
