/**
 * @file env.ts — Runtime environment config getters for the PDF engine v2.
 *
 * H-B5 fix: single source of truth for `isPaPipeline()` so index.ts and
 * stage-rl-iterate.ts can never silently diverge.
 *
 * H-B6 fix: case-normalised opt-out values — 'False', 'FALSE', 'false ', '0',
 * 'no', 'NO', 'off', 'OFF' all correctly opt out of the PA path.
 * Old semantics (`=== 'true'`) silently defaulted typos to legacy — safe but
 * confusing. New semantics need case normalisation so 'False'/'FALSE'/'0'
 * don't silently activate PA. Recognised opt-out tokens:
 *   false | 0 | no | off
 * Empty string (unset) → default → PA path.
 */

/**
 * Returns true when the PA pipeline is active (the default).
 *
 * Opt-out values (any capitalisation, with/without surrounding whitespace):
 *   'false', 'False', 'FALSE', '0', 'no', 'No', 'NO', 'off', 'Off', 'OFF'
 *
 * All other values, including unset (empty string) and 'true'/'True'/'TRUE',
 * return true (PA path).
 *
 * At runtime a warning is logged for non-canonical values so misconfigured
 * deployments are visible in logs immediately.
 */
export function isPaPipeline(): boolean {
  const raw = (process.env.PA_PIPELINE ?? '').toLowerCase().trim()

  // Recognised opt-out tokens
  if (raw === 'false' || raw === '0' || raw === 'no' || raw === 'off') {
    // Warn if the raw value was non-canonical (e.g. 'False', 'FALSE', '0')
    const original = (process.env.PA_PIPELINE ?? '').trim()
    if (original !== 'false') {
      console.warn(
        `[pdf-engine-v2] Non-canonical PA_PIPELINE opt-out value '${original}'. ` +
        `Normalised to 'false'. Recommend setting PA_PIPELINE=false explicitly.`,
      )
    }
    return false
  }

  // Warn on unrecognised non-empty, non-true values
  if (raw !== '' && raw !== 'true') {
    console.warn(
      `[pdf-engine-v2] Unrecognised PA_PIPELINE value '${process.env.PA_PIPELINE}'. ` +
      `Expected 'true', 'false', or unset. Defaulting to PA path (true).`,
    )
  }

  return true  // default = PA path
}

/**
 * Returns the active PDF renderer version.
 *
 * H-B4 fix: invalid-value fallback is now path-appropriate:
 *   PA path  → 'v3' (not hardcoded 'v2')
 *   Legacy path → 'v2'
 *
 * Resolution order:
 *   1. Explicit PDF_RENDERER env var (non-empty) — always wins.
 *   2. PA path default → 'v3'.
 *   3. Legacy path default → 'v2'.
 *
 * Invalid explicit values (not 'v2' or 'v3') log a warning and fall back
 * to the path-appropriate default.
 */
export function getPdfRenderer(): 'v2' | 'v3' {
  const explicit = (process.env.PDF_RENDERER ?? '') || null  // '' → null (G-B4 regression guard)
  const paDefault: 'v2' | 'v3' = isPaPipeline() ? 'v3' : 'v2'

  if (!explicit) return paDefault

  if (explicit === 'v2' || explicit === 'v3') return explicit

  // Invalid explicit value — warn and fall back to path-appropriate default
  console.warn(
    `[pdf-engine-v2] Unrecognised PDF_RENDERER value '${explicit}'. ` +
    `Valid values: v2, v3. Falling back to path-appropriate default '${paDefault}'.`,
  )
  return paDefault
}
