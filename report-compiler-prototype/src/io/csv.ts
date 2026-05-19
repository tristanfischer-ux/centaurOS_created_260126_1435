export function parseCsvRecords(text: string): Array<Record<string, string>> {
  const rows = parseCsvRows(text)
  if (rows.length === 0) return []
  const [header, ...body] = rows
  return body
    .filter(row => row.some(value => value.trim()))
    .map(row => Object.fromEntries(header.map((key, index) => [key, row[index] ?? ''])))
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]
    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      row.push(field)
      field = ''
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter(item => item.some(value => value.trim()))
}
