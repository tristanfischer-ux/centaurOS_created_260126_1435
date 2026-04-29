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
  // Catch "MISSING - Not found on website..." and "UNKNOWN - ..." prefix patterns.
  // No length cap — these sentinel prefixes are always junk regardless of length.
  if (lower.startsWith('missing')) return true
  if (lower.startsWith('unknown')) return true
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

/**
 * coalesceFilled — returns the first argument for which hasValue() is true.
 *
 * Replaces chains of `listing.X ?? attrs.X` which only fall through on
 * null/undefined, NOT on empty arrays. Use this so that an empty column-level
 * array doesn't shadow a populated attrs value.
 *
 * Example:
 *   coalesceFilled(listing.industries, attrs.industries)
 *   // returns attrs.industries if listing.industries is [] (empty array)
 */
export function coalesceFilled<T>(...vals: T[]): T | undefined {
  for (const v of vals) {
    if (hasValue(v)) return v
  }
  return undefined
}

/**
 * sanitiseStringArray — normalise any database string-array value into a
 * clean, deduplicated string[].
 *
 * Handles the malformed shapes that appear in marketplace_listings:
 *   • Clean string arrays: pass through, dedupe, drop junk entries.
 *   • JSON string-in-array: `["[\"ISO 9001:2015\"", "\"ISO 14001:2015\"]"]`
 *     — each element is attempted as JSON; sub-arrays are flattened.
 *   • JSON-stringified array in a single element: `["[\"ISO 9001\",\"ISO 14001\"]"]`
 *   • JSON-stringified array as the whole value: `"[\"ISO 9001\",\"ISO 14001\"]"`
 */
export function sanitiseStringArray(input: unknown): string[] {
  if (input === null || input === undefined) return []

  // If a plain string arrives, try to JSON-parse it as an array first.
  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) {
          return sanitiseStringArray(parsed)
        }
      } catch {
        // not valid JSON — treat as a single value
      }
    }
    // Single clean string — strip outer quotes/brackets
    const clean = trimmed.replace(/^["'\[{]|["'\]}]$/g, '').trim()
    return isEmptyString(clean) ? [] : [clean]
  }

  if (!Array.isArray(input)) return []

  const results: string[] = []
  for (const item of input) {
    if (item === null || item === undefined) continue
    if (typeof item !== 'string') {
      // Numbers, objects etc — stringify and recurse
      const sub = sanitiseStringArray([String(item)])
      results.push(...sub)
      continue
    }

    const trimmed = item.trim()

    // Attempt to JSON-parse each element (catches the malformed ISO cert shape)
    if (trimmed.startsWith('[') || trimmed.startsWith('"')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) {
          const sub = sanitiseStringArray(parsed)
          results.push(...sub)
          continue
        }
        if (typeof parsed === 'string') {
          const clean = parsed.trim()
          if (!isEmptyString(clean)) results.push(clean)
          continue
        }
      } catch {
        // fall through to plain-string handling
      }
    }

    // Strip stray quotes, brackets, escaped quotes
    const stripped = trimmed
      .replace(/^["'\[]+|["'\]]+$/g, '')
      .replace(/\\"/g, '')
      .trim()

    if (!isEmptyString(stripped)) results.push(stripped)
  }

  // Deduplicate (case-insensitive key, preserve original casing of first occurrence)
  const seen = new Set<string>()
  return results.filter((s) => {
    const key = s.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
