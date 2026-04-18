/**
 * @file sanitize-filter.ts — PostgREST filter-value sanitizer.
 *
 * @description Canonical helper for sanitizing user-controlled strings before
 * they get interpolated into Supabase `.ilike()` patterns or `.or()` filter
 * expressions. Escapes ilike wildcards (%, _) and strips characters that
 * PostgREST parses as syntax (parentheses, commas, colons, quotes, brackets).
 *
 * @security Prevents filter-injection attacks where a user-supplied string
 * could break out of an ilike pattern and trigger unintended OR branches.
 *
 * Historical: 4 files carried private inline copies of this helper
 * (`investors.ts`, `agent-artifacts.ts`, `knowledge.ts`, `component-library.ts`).
 * This module is the shared canonical version — new callers should import from
 * here, existing callers can migrate opportunistically.
 */

/**
 * Sanitize a user-controlled string for use in PostgREST ilike/or filters.
 *
 * @example
 *   // unsafe: user input "foo%bar" could match unintended rows.
 *   .ilike('name', `%${userInput}%`)
 *   // safe:
 *   .ilike('name', `%${sanitizeFilterValue(userInput)}%`)
 */
export function sanitizeFilterValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/[\n\r\t]/g, " ")
    .replace(/[,()\."*:!'[\]{}]/g, "")
}
