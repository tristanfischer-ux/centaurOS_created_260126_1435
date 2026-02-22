/**
 * @file marketplace-utils.ts
 * @description Utilities for safely handling marketplace listing attributes.
 * Attributes can arrive as JSONB objects or JSON strings; these helpers normalize
 * and coerce values to prevent character-by-character rendering bugs.
 */

/**
 * Safely normalize listing.attributes to a Record, parsing JSON strings.
 * Prevents Object.entries() from iterating character-by-character when
 * attributes arrives as a string.
 *
 * @param attributes - Raw attributes from marketplace_listings (object, string, or null/undefined)
 * @returns Normalized Record, never a string. Record<string, any> for JSX compatibility.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON from DB has no schema; any needed for JSX
export function safeParseAttributes(attributes: unknown): Record<string, any> {
  if (!attributes) return {}
  if (typeof attributes === 'string') {
    try {
      return JSON.parse(attributes) as Record<string, any>
    } catch {
      return {}
    }
  }
  if (typeof attributes === 'object' && !Array.isArray(attributes)) {
    return attributes as Record<string, any>
  }
  return {}
}

/**
 * Safely coerce a value to string[], handling JSON strings and CSV.
 * Prevents .map() crashes when DB returns a string instead of an array.
 *
 * @param value - Raw value (array, JSON string, CSV string, or other)
 * @returns Normalized string[]
 */
export function safeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.map(String)
    } catch {
      /* not JSON */
    }
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}
