/**
 * Security utilities for input sanitization
 *
 * ─── Three-surface error policy (P1.4, 2026-04-23) ─────────────────────
 *
 * Every server action has THREE distinct audiences for an error, and each
 * needs a different level of detail. Historically `sanitizeErrorMessage()`
 * collapsed all three into a single sanitised string, which got stored in
 * `pipeline_runs.error_message` and `image_render_state.failed_ids` — total
 * observability loss. Hence: three surfaces, one policy.
 *
 *   1. User-facing response        — SANITISED (this function)
 *      Returned to the browser. Must not expose stacks, internal IDs, or
 *      system internals. Uses SAFE_ERROR_MESSAGES + the lowercase-substring
 *      mappings below. The default is the generic "Please try again"
 *      message so callers never leak unintentionally.
 *
 *   2. DB-stored error_message / failure details  — RAW (not this function)
 *      Persisted in `pipeline_runs.error_message`, `image_render_state.
 *      failed_reasons[moduleId].rawError`, etc. This is the ground-truth
 *      log for debugging failures hours or days after the fact, so it
 *      must be the UNSANITISED message + stack. Truncate to ~2000 chars
 *      before storage so a pathological provider-error-with-full-JSON
 *      doesn't blow a TEXT column; never sanitise.
 *
 *   3. console.error / Vercel log  — RAW (not this function)
 *      Real-time debugging. Same policy as DB storage: use the raw
 *      Error.message + stack, never the sanitised version. Vercel logs
 *      get pulled with `npx vercel logs --expand` when an autopilot run
 *      drops a stage; seeing "An unexpected error occurred" there is the
 *      bug-chasing nightmare the three-surface policy is designed to end.
 *
 * Server actions produce BOTH surfaces by returning
 * `{ error: string, rawError?: string }`. Callers that persist to the DB
 * or stream to logs read `rawError` (falling back to `error` if absent).
 * The UI ignores `rawError` entirely.
 *
 * Do not rename `sanitizeErrorMessage` without updating this header and
 * `src/lib/server-action-utils.ts` in the same commit — they are the two
 * halves of the policy.
 */

/**
 * Sanitize a filename to prevent path traversal attacks
 * Removes directory traversal sequences and invalid characters
 */
export function sanitizeFileName(fileName: string): string {
  if (!fileName) return 'unnamed_file'
  
  // Remove path traversal sequences
  let sanitized = fileName
    .replace(/\.\./g, '')           // Remove ..
    .replace(/\.\//g, '')           // Remove ./
    .replace(/\/\./g, '')           // Remove /.
    .replace(/\\/g, '')             // Remove backslashes
    .replace(/\//g, '')             // Remove forward slashes
    .replace(/:/g, '')              // Remove colons (Windows drive letters)
    .replace(/\0/g, '')             // Remove null bytes

  // Only allow safe characters: alphanumeric, underscores, hyphens, periods
  sanitized = sanitized.replace(/[^a-zA-Z0-9._-]/g, '_')

  // Prevent multiple consecutive periods or underscores
  sanitized = sanitized.replace(/\.{2,}/g, '.').replace(/_{2,}/g, '_')

  // Ensure filename doesn't start or end with a period or underscore
  sanitized = sanitized.replace(/^[._]+/, '').replace(/[._]+$/, '')

  // Ensure the filename is not empty after sanitization
  if (!sanitized || sanitized.length === 0) {
    return 'unnamed_file'
  }

  // Limit filename length (255 chars is typical filesystem limit)
  if (sanitized.length > 200) {
    const ext = sanitized.split('.').pop() || ''
    const baseName = sanitized.slice(0, 200 - ext.length - 1)
    sanitized = ext ? `${baseName}.${ext}` : baseName
  }

  return sanitized
}

/**
 * Sanitize HTML content to prevent XSS
 * Escapes HTML special characters
 */
export function escapeHtml(str: string): string {
  if (!str) return ''
  
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
  }

  return str.replace(/[&<>"'`=/]/g, (char) => htmlEscapes[char] || char)
}

/**
 * Validate UUID format
 */
export function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(str)
}

/**
 * Sanitize and validate email format
 */
export function sanitizeEmail(email: string): string | null {
  if (!email) return null
  
  const trimmed = email.trim().toLowerCase()
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  
  if (!emailRegex.test(trimmed)) {
    return null
  }
  
  // Basic length check
  if (trimmed.length > 254) {
    return null
  }
  
  return trimmed
}

/**
 * Validate and constrain numeric input
 */
export function sanitizeNumber(value: number, min: number, max: number): number {
  if (typeof value !== 'number' || isNaN(value)) {
    return min
  }
  return Math.max(min, Math.min(max, value))
}

/**
 * Sanitize string for use in logs (remove PII patterns)
 */
export function sanitizeForLogging(str: string): string {
  if (!str) return ''
  
  return str
    // Remove potential emails
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]')
    // Remove potential phone numbers
    .replace(/(\+?[\d\s\-()]{10,})/g, '[PHONE_REDACTED]')
    // Remove potential credit card numbers
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD_REDACTED]')
    // Remove potential API keys (long alphanumeric strings)
    .replace(/\b[a-zA-Z0-9_-]{32,}\b/g, '[KEY_REDACTED]')
}

/**
 * Map of known safe error messages that can be shown to users
 */
const SAFE_ERROR_MESSAGES: Record<string, string> = {
  'Unauthorized': 'You are not authorized to perform this action',
  'Not found': 'The requested resource was not found',
  'Task not found': 'Task not found',
  'User not found': 'User not found',
  'Enrollment not found': 'Enrollment not found',
  'Document not found': 'Document not found',
  'Profile not found': 'Profile not found',
  'Provider not found': 'Provider not found',
  'Provider profile not found': 'Provider profile not found',
  'Not authenticated': 'Please sign in to continue',
  'Invalid user ID': 'Invalid user session. Please sign in again.',
}

/**
 * Sanitize error messages before returning to clients
 * Prevents internal details from being exposed
 */
export function sanitizeErrorMessage(error: unknown): string {
  // Handle null/undefined
  if (!error) return 'An unexpected error occurred. Please try again or contact support if the problem persists.'
  
  // Get error message string
  let message: string
  if (error instanceof Error) {
    message = error.message
  } else if (typeof error === 'string') {
    message = error
  } else if (typeof error === 'object' && error !== null && 'message' in error) {
    message = String((error as { message: unknown }).message)
  } else {
    return 'An unexpected error occurred. Please try again or contact support if the problem persists.'
  }
  
  // Check if it's a known safe message
  for (const [pattern, safeMessage] of Object.entries(SAFE_ERROR_MESSAGES)) {
    if (message.toLowerCase().includes(pattern.toLowerCase())) {
      return safeMessage
    }
  }
  
  // Check for common database errors and provide specific messages
  const lower = message.toLowerCase()

  if (lower.includes('duplicate key') || lower.includes('unique constraint') || lower.includes('already exists')) {
    return 'This record already exists. Please check for duplicates.'
  }

  if (lower.includes('violates foreign key')) {
    return 'This operation references data that no longer exists. Please refresh and try again.'
  }

  if (lower.includes('violates check constraint')) {
    return 'The provided value is out of the allowed range.'
  }

  if (lower.includes('row-level security') || lower.includes('new row violates') || lower.includes('policy')) {
    return "You don't have permission to modify this record."
  }

  if (lower.includes('pgrst301') || lower.includes('jwt expired')) {
    return 'Your session has expired. Please sign in again.'
  }

  if (lower.includes('pgrst116')) {
    return 'The requested record was not found. It may have been deleted.'
  }

  if (lower.includes('pgrst')) {
    return 'A database error occurred. Please try again.'
  }

  if (lower.includes('rate limit') || lower.includes('429') || lower.includes('too many requests')) {
    return 'Too many requests. Please wait a moment and try again.'
  }

  if (lower.includes('payload too large') || lower.includes('413')) {
    return 'The file or data is too large. Please reduce the size and try again.'
  }

  if (lower.includes('500') || lower.includes('502') || lower.includes('503') || lower.includes('internal server error')) {
    return 'A temporary service error occurred. Please try again in a few minutes.'
  }

  if (lower.includes('529') || lower.includes('overloaded')) {
    return 'The service is temporarily overloaded. Please try again shortly.'
  }

  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('etimedout') || lower.includes('aborted')) {
    return 'The request timed out. Please try again.'
  }

  if (lower.includes('fetch failed') || lower.includes('econnrefused') || lower.includes('enotfound') || lower.includes('network')) {
    return 'Could not reach the server. Please check your connection.'
  }

  if (lower.includes('storage') || lower.includes('bucket') || lower.includes('upload failed')) {
    return 'File storage error. Please try again.'
  }

  if (lower.includes('permission') || lower.includes('forbidden') || lower.includes('403')) {
    return 'You do not have permission to perform this action.'
  }

  // For validation errors, we can show them as they don't expose internal details
  if (message.startsWith('Invalid') || message.includes('required') || message.includes('must be')) {
    return message
  }

  // Default: return generic error to avoid exposing internal details
  return 'An unexpected error occurred. Please try again or contact support if the problem persists.'
}

/**
 * Maximum character length for raw error messages persisted to the DB or
 * returned in a `rawError` field. TEXT columns tolerate more, but a
 * pathological provider error (e.g. full OpenAI JSON response body on a
 * 400) can balloon to tens of KB and blow React Flight / query-result
 * sizes. 2000 chars covers every message + stack I've seen in production.
 */
export const RAW_ERROR_MAX_LEN = 2000

/**
 * Extract a raw (UN-SANITISED) error message + stack trace from an
 * arbitrary thrown value, for surface 2 (DB) and surface 3 (console/log)
 * of the three-surface policy documented at the top of this file.
 *
 * Pairs with `sanitizeErrorMessage()` (surface 1) — always call BOTH and
 * pass both fields through the server action's return shape.
 *
 * @returns A string truncated to `RAW_ERROR_MAX_LEN` characters that may
 *          include an Error stack (joined with a newline). Never empty —
 *          returns `'Unknown error'` as the ultimate fallback.
 */
export function extractRawErrorMessage(error: unknown): string {
    if (!error) return 'Unknown error'

    let raw: string
    if (error instanceof Error) {
        raw = error.stack ? `${error.message}\n${error.stack}` : error.message
    } else if (typeof error === 'string') {
        raw = error
    } else if (typeof error === 'object' && 'message' in error) {
        const msg = (error as { message: unknown }).message
        raw = typeof msg === 'string' ? msg : String(msg)
    } else {
        try {
            raw = JSON.stringify(error)
        } catch {
            raw = String(error)
        }
    }

    if (!raw || raw.length === 0) return 'Unknown error'
    if (raw.length > RAW_ERROR_MAX_LEN) {
        return `${raw.slice(0, RAW_ERROR_MAX_LEN - 15)}…[truncated]`
    }
    return raw
}
