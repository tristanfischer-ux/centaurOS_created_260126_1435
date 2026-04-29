/**
 * hasValue — universal empty-check for supplier detail page.
 *
 * Returns false for every form of "nothing here":
 *   null, undefined, empty string, whitespace-only string,
 *   empty array, array of only empty/junk strings,
 *   empty object, object whose every value is empty,
 *   and the sentinel strings that litter the database
 *   ("Missing", "—", "Not specified", "Unknown", "N/A", "TBD", "TBC",
 *    "[]", "{}", "null", "undefined").
 */

const EMPTY_SENTINELS = new Set([
  'missing',
  '—',
  '-',
  'not specified',
  'unknown',
  'n/a',
  'tbd',
  'tbc',
  '[]',
  '{}',
  'null',
  'undefined',
  '',
  'unknown - not specified on website',
  'missing - not found on website',
])

function isEmptyString(v: string): boolean {
  const lower = v.trim().toLowerCase()
  if (lower === '') return true
  if (EMPTY_SENTINELS.has(lower)) return true
  // Catch "MISSING - Not found on website..." prefix patterns
  if (lower.startsWith('missing') && lower.length < 80) return true
  if (lower.startsWith('unknown') && lower.length < 80) return true
  return false
}

export function hasValue(v: unknown): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === 'string') return !isEmptyString(v)
  if (typeof v === 'boolean') return true   // explicit false is still a value
  if (typeof v === 'number') return !isNaN(v)

  if (Array.isArray(v)) {
    if (v.length === 0) return false
    // Array must have at least one non-empty entry
    return v.some((item) => {
      if (item === null || item === undefined) return false
      if (typeof item === 'string') return !isEmptyString(item)
      if (typeof item === 'object') return hasValue(item)
      return true
    })
  }

  if (typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>)
    if (entries.length === 0) return false
    return entries.some(([, val]) => hasValue(val))
  }

  return true
}
