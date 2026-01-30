/**
 * Rate Limiting Module
 * 
 * Provides rate limiting for API endpoints and server actions.
 * Uses in-memory storage by default, can be upgraded to Redis/Upstash for production.
 * 
 * Usage:
 *   const result = await rateLimit('login', ip, { limit: 5, window: 15 * 60 * 1000 })
 *   if (!result.success) return { error: 'Too many attempts, please try again later' }
 */

// In-memory store for rate limiting (use Redis in production)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

// Clean up expired entries periodically
let cleanupInterval: ReturnType<typeof setInterval> | null = null

function startCleanup() {
    if (cleanupInterval) return
    cleanupInterval = setInterval(() => {
        const now = Date.now()
        for (const [key, value] of rateLimitStore.entries()) {
            if (now > value.resetTime) {
                rateLimitStore.delete(key)
            }
        }
    }, 60 * 1000) // Clean up every minute
}

// Start cleanup on module load
if (typeof window === 'undefined') {
    startCleanup()
}

export interface RateLimitConfig {
    /** Maximum number of requests allowed in the window */
    limit: number
    /** Time window in milliseconds */
    window: number
}

export interface RateLimitResult {
    success: boolean
    remaining: number
    resetTime: number
    error?: string
}

/**
 * Default rate limit configurations for different actions
 */
export const RATE_LIMIT_CONFIGS = {
    // Authentication - strict limits
    login: { limit: 5, window: 15 * 60 * 1000 },        // 5 attempts per 15 minutes
    signup: { limit: 3, window: 60 * 60 * 1000 },       // 3 signups per hour per IP
    passwordReset: { limit: 3, window: 60 * 60 * 1000 }, // 3 reset requests per hour
    
    // Invitations
    invitation: { limit: 10, window: 60 * 60 * 1000 },   // 10 invitations per hour
    invitationToken: { limit: 20, window: 60 * 1000 },   // 20 token checks per minute
    
    // AI endpoints - expensive operations
    aiSearch: { limit: 20, window: 60 * 1000 },          // 20 searches per minute
    aiMatch: { limit: 10, window: 60 * 1000 },           // 10 matches per minute
    voiceToTask: { limit: 5, window: 60 * 1000 },        // 5 voice transcriptions per minute
    
    // General API
    api: { limit: 100, window: 60 * 1000 },              // 100 requests per minute
    upload: { limit: 20, window: 60 * 1000 },            // 20 uploads per minute
    
    // Public endpoints
    health: { limit: 60, window: 60 * 1000 },            // 60 requests per minute
    preview: { limit: 30, window: 60 * 1000 },           // 30 requests per minute
} as const satisfies Record<string, RateLimitConfig>

export type RateLimitAction = keyof typeof RATE_LIMIT_CONFIGS

/**
 * Check and update rate limit for an action
 * 
 * @param action - The type of action being rate limited
 * @param identifier - Unique identifier (usually IP address or user ID)
 * @param config - Optional custom configuration (uses defaults if not provided)
 * @returns Rate limit result with success status and remaining count
 */
export async function rateLimit(
    action: RateLimitAction | string,
    identifier: string,
    config?: Partial<RateLimitConfig>
): Promise<RateLimitResult> {
    const defaultConfig = RATE_LIMIT_CONFIGS[action as RateLimitAction] || RATE_LIMIT_CONFIGS.api
    const { limit, window } = { ...defaultConfig, ...config }
    
    const key = `ratelimit:${action}:${identifier}`
    const now = Date.now()
    
    // Get or create entry
    let entry = rateLimitStore.get(key)
    
    if (!entry || now > entry.resetTime) {
        // Create new entry or reset expired entry
        entry = { count: 0, resetTime: now + window }
        rateLimitStore.set(key, entry)
    }
    
    // Check if limit exceeded
    if (entry.count >= limit) {
        return {
            success: false,
            remaining: 0,
            resetTime: entry.resetTime,
            error: `Rate limit exceeded. Try again in ${Math.ceil((entry.resetTime - now) / 1000)} seconds.`
        }
    }
    
    // Increment counter
    entry.count++
    
    return {
        success: true,
        remaining: limit - entry.count,
        resetTime: entry.resetTime
    }
}

/**
 * Get the client IP address from request headers
 * Works with Vercel, Cloudflare, and direct connections
 */
export function getClientIP(headers: Headers): string {
    // Check for forwarded headers (in order of preference)
    const forwarded = headers.get('x-forwarded-for')
    if (forwarded) {
        // x-forwarded-for can contain multiple IPs, take the first (client)
        return forwarded.split(',')[0].trim()
    }
    
    // Vercel
    const vercelIp = headers.get('x-vercel-forwarded-for')
    if (vercelIp) {
        return vercelIp.split(',')[0].trim()
    }
    
    // Cloudflare
    const cfIp = headers.get('cf-connecting-ip')
    if (cfIp) {
        return cfIp
    }
    
    // Real IP header (nginx)
    const realIp = headers.get('x-real-ip')
    if (realIp) {
        return realIp
    }
    
    // Fallback to a default (shouldn't happen in production)
    return 'unknown'
}

/**
 * Helper to check rate limit in server actions
 * Returns the error message if rate limited, null otherwise
 */
export async function checkRateLimit(
    action: RateLimitAction | string,
    identifier: string,
    config?: Partial<RateLimitConfig>
): Promise<string | null> {
    const result = await rateLimit(action, identifier, config)
    return result.success ? null : (result.error || 'Rate limit exceeded')
}

/**
 * Reset rate limit for a specific action and identifier
 * Useful for unlocking after successful verification
 */
export async function resetRateLimit(action: string, identifier: string): Promise<void> {
    const key = `ratelimit:${action}:${identifier}`
    rateLimitStore.delete(key)
}
