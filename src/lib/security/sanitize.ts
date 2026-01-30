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
