/**
 * Security utilities for input sanitization
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
  if (!error) return 'An error occurred. Please try again.'
  
  // Get error message string
  let message: string
  if (error instanceof Error) {
    message = error.message
  } else if (typeof error === 'string') {
    message = error
  } else if (typeof error === 'object' && error !== null && 'message' in error) {
    message = String((error as { message: unknown }).message)
  } else {
    return 'An error occurred. Please try again.'
  }
  
  // Check if it's a known safe message
  for (const [pattern, safeMessage] of Object.entries(SAFE_ERROR_MESSAGES)) {
    if (message.toLowerCase().includes(pattern.toLowerCase())) {
      return safeMessage
    }
  }
  
  // Check for common database errors and provide generic messages
  if (message.includes('PGRST') || message.includes('duplicate key') || message.includes('violates')) {
    return 'A database error occurred. Please try again.'
  }
  
  if (message.includes('network') || message.includes('timeout') || message.includes('ECONNREFUSED')) {
    return 'A network error occurred. Please check your connection and try again.'
  }
  
  if (message.includes('permission') || message.includes('forbidden') || message.includes('403')) {
    return 'You do not have permission to perform this action.'
  }
  
  // For validation errors, we can show them as they don't expose internal details
  if (message.startsWith('Invalid') || message.includes('required') || message.includes('must be')) {
    return message
  }
  
  // Default: return generic error to avoid exposing internal details
  return 'An error occurred. Please try again.'
}
