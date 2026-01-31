/**
 * URL validation utilities for preventing SSRF attacks
 * 
 * These functions validate URLs to ensure they don't point to internal resources
 * like localhost, private IP ranges, or cloud metadata services.
 */

// Private IP ranges that should be blocked
const PRIVATE_IP_RANGES = [
    /^10\./,                           // 10.0.0.0/8
    /^172\.(1[6-9]|2\d|3[01])\./,     // 172.16.0.0/12
    /^192\.168\./,                     // 192.168.0.0/16
    /^127\./,                          // 127.0.0.0/8 (loopback)
    /^0\./,                            // 0.0.0.0/8
    /^169\.254\./,                     // 169.254.0.0/16 (link-local)
    /^fc00:/i,                         // IPv6 private
    /^fd/i,                            // IPv6 private
    /^fe80:/i,                         // IPv6 link-local
    /^::1$/,                           // IPv6 loopback
]

// Hostnames that should be blocked
const BLOCKED_HOSTNAMES = [
    'localhost',
    'localhost.localdomain',
    '127.0.0.1',
    '0.0.0.0',
    '::1',
    '[::1]',
    // AWS metadata service
    '169.254.169.254',
    'metadata.google.internal',
    'metadata.google',
    // Azure metadata
    '169.254.169.254',
    // Other cloud metadata endpoints
    'metadata',
]

/**
 * Check if a hostname is a private/internal IP address
 */
export function isPrivateIP(hostname: string): boolean {
    return PRIVATE_IP_RANGES.some(regex => regex.test(hostname))
}

/**
 * Check if a hostname should be blocked
 */
export function isBlockedHostname(hostname: string): boolean {
    const normalizedHostname = hostname.toLowerCase().trim()
    return BLOCKED_HOSTNAMES.includes(normalizedHostname) || isPrivateIP(normalizedHostname)
}

/**
 * Validate a URL for safe external image loading
 * Returns true if the URL is safe to use, false otherwise
 * 
 * @param url - The URL to validate
 * @param allowHttp - Whether to allow HTTP URLs (defaults to false in production)
 */
export function isValidImageUrl(url: string, allowHttp?: boolean): boolean {
    try {
        const parsed = new URL(url.trim())
        
        // Check protocol
        const isProduction = process.env.NODE_ENV === 'production'
        const httpAllowed = allowHttp ?? !isProduction
        
        if (parsed.protocol !== 'https:' && !(httpAllowed && parsed.protocol === 'http:')) {
            return false
        }
        
        // Check for blocked hostnames and private IPs
        if (isBlockedHostname(parsed.hostname)) {
            return false
        }
        
        // Check for DNS rebinding attacks (hostname containing numbers that look like IPs)
        // This is a basic check; more sophisticated checks might be needed
        if (/^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname) && isPrivateIP(parsed.hostname)) {
            return false
        }
        
        return true
    } catch {
        return false
    }
}

/**
 * Validate a redirect URL to ensure it's on an allowed domain
 * 
 * @param url - The URL to validate
 * @param allowedHosts - Array of allowed hostnames (e.g., ['example.com', 'app.example.com'])
 */
export function isValidRedirectUrl(url: string, allowedHosts?: string[]): boolean {
    try {
        const parsed = new URL(url.trim())
        
        // Only allow HTTPS redirects in production
        if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
            return false
        }
        
        // If allowed hosts specified, check against them
        if (allowedHosts && allowedHosts.length > 0) {
            const hostname = parsed.hostname.toLowerCase()
            return allowedHosts.some(host => {
                const normalizedHost = host.toLowerCase()
                return hostname === normalizedHost || hostname.endsWith(`.${normalizedHost}`)
            })
        }
        
        // Default: check against app URL
        const appUrl = process.env.NEXT_PUBLIC_APP_URL
        if (appUrl) {
            try {
                const appParsed = new URL(appUrl)
                const hostname = parsed.hostname.toLowerCase()
                const appHostname = appParsed.hostname.toLowerCase()
                return hostname === appHostname || hostname.endsWith(`.${appHostname}`)
            } catch {
                return false
            }
        }
        
        return false
    } catch {
        return false
    }
}

/**
 * Sanitize a URL for logging (remove sensitive parts)
 */
export function sanitizeUrlForLogging(url: string): string {
    try {
        const parsed = new URL(url)
        // Remove auth info, keep only origin and pathname
        return `${parsed.origin}${parsed.pathname}`
    } catch {
        return '[invalid-url]'
    }
}

/**
 * Sanitize a URL for use in href attributes (XSS prevention)
 * Returns '#' for invalid or potentially dangerous URLs
 * 
 * This function is safe to use on both client and server side.
 * 
 * @param url - The URL to sanitize
 * @param allowedProtocols - Protocols to allow (defaults to http, https, mailto, tel)
 */
export function sanitizeHref(
    url: string | null | undefined,
    allowedProtocols: string[] = ['http:', 'https:', 'mailto:', 'tel:']
): string {
    if (!url || typeof url !== 'string') return '#'
    
    const trimmedUrl = url.trim()
    if (!trimmedUrl) return '#'
    
    try {
        // Handle relative URLs by using a dummy base
        const parsed = new URL(trimmedUrl, 'https://example.com')
        
        // Check if protocol is allowed
        if (!allowedProtocols.includes(parsed.protocol)) {
            return '#'
        }
        
        // Block javascript: and data: URLs (even if somehow bypassed above)
        const lowerUrl = trimmedUrl.toLowerCase()
        if (lowerUrl.startsWith('javascript:') || lowerUrl.startsWith('data:')) {
            return '#'
        }
        
        return trimmedUrl
    } catch {
        return '#'
    }
}

/**
 * Sanitize a URL for use in image src attributes
 * Returns undefined for invalid or potentially dangerous URLs
 */
export function sanitizeImageSrc(url: string | null | undefined): string | undefined {
    if (!url || typeof url !== 'string') return undefined
    
    const trimmedUrl = url.trim()
    if (!trimmedUrl) return undefined
    
    try {
        const parsed = new URL(trimmedUrl, 'https://example.com')
        
        // Only allow http and https for images
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return undefined
        }
        
        // Block data: URLs (could be used for XSS)
        if (trimmedUrl.toLowerCase().startsWith('data:')) {
            return undefined
        }
        
        return trimmedUrl
    } catch {
        return undefined
    }
}

/**
 * Validate and sanitize a video embed URL
 * Only allows known safe video platforms
 */
export function sanitizeVideoEmbedUrl(url: string | null | undefined): string | null {
    if (!url || typeof url !== 'string') return null
    
    const trimmedUrl = url.trim()
    if (!trimmedUrl) return null
    
    // Allowed video embed patterns
    const allowedPatterns = [
        /^https?:\/\/(www\.)?youtube\.com\/embed\/[\w-]+/i,
        /^https?:\/\/player\.vimeo\.com\/video\/\d+/i,
        /^https?:\/\/(www\.)?loom\.com\/embed\/[\w-]+/i,
        /^https?:\/\/(www\.)?dailymotion\.com\/embed\/video\/[\w-]+/i,
        /^https?:\/\/fast\.wistia\.net\/embed\/iframe\/[\w-]+/i,
    ]
    
    if (allowedPatterns.some(pattern => pattern.test(trimmedUrl))) {
        return trimmedUrl
    }
    
    return null
}
