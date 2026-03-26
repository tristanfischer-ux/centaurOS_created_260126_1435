/**
 * Rate Limiting Module
 * 
 * Provides rate limiting for API endpoints and server actions.
 * Uses Supabase for distributed storage (works across serverless instances).
 * Falls back to in-memory for development if Supabase unavailable.
 * 
 * Usage:
 *   const result = await rateLimit('login', ip, { limit: 5, window: 15 * 60 * 1000 })
 *   if (!result.success) return { error: 'Too many attempts, please try again later' }
 */

import { createClient } from '@supabase/supabase-js'

// In-memory fallback store (development only)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

// Clean up expired entries periodically (for in-memory fallback)
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

// Start cleanup on module load (for fallback)
if (typeof window === 'undefined') {
    startCleanup()
}

// Create a Supabase client for rate limiting (uses service role for atomic operations)
function getRateLimitClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!url || !serviceKey) {
        return null // Fall back to in-memory
    }
    
    return createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    })
}

// Check if we should use distributed rate limiting
const useDistributed = process.env.NODE_ENV === 'production'

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
    waitlist: { limit: 5, window: 60 * 60 * 1000 },      // 5 waitlist joins per hour per IP
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
    webFetch: { limit: 30, window: 60 * 1000 },          // 30 web fetches per minute
    
    // Public endpoints
    health: { limit: 60, window: 60 * 1000 },            // 60 requests per minute
    preview: { limit: 30, window: 60 * 1000 },           // 30 requests per minute
    claimPreview: { limit: 30, window: 60 * 1000 },      // 30 claim previews per minute
    
    // AI server actions — prevent cost abuse
    aiAdvisory: { limit: 10, window: 60 * 1000 },        // 10 advisory answers per minute
    aiAnalysis: { limit: 5, window: 60 * 1000 },          // 5 business plan analyses per minute  
    aiCadLab: { limit: 30, window: 60 * 1000 },           // 30 The Forge generations per minute (batch generates 2 calls per module × up to 10 modules)
    aiSmartGoal: { limit: 10, window: 60 * 1000 },        // 10 SMART goal suggestions per minute
    aiStrategicPlan: { limit: 5, window: 60 * 1000 },     // 5 strategic plans per minute
    aiOutreach: { limit: 5, window: 60 * 1000 },            // 5 outreach AI calls per minute (heavy multi-turn)
    aiGrammar: { limit: 20, window: 60 * 1000 },             // 20 grammar AI calls per minute (research uses 3 per invocation)
    
    // AI worker & enrichment
    aiWorker: { limit: 10, window: 60 * 1000 },             // 10 AI worker triggers per minute per foundry
    aiEnrichment: { limit: 5, window: 60 * 1000 },          // 5 enrichment calls per minute per foundry

    // Telegram bot
    telegram: { limit: 20, window: 60 * 60 * 1000 },      // 20 commands per hour
    telegramSpecialist: { limit: 15, window: 60 * 1000 },  // 15 specialist messages per minute per user
    telegramVoice: { limit: 5, window: 60 * 1000 },        // 5 voice transcriptions per minute per user
    
    // Email/invitations
    emailInvite: { limit: 10, window: 60 * 60 * 1000 },   // 10 invitations per hour
    
    // Webhooks (IP-based)
    webhook: { limit: 100, window: 60 * 1000 },            // 100 requests per minute per IP
} as const satisfies Record<string, RateLimitConfig>

export type RateLimitAction = keyof typeof RATE_LIMIT_CONFIGS

/**
 * Check and update rate limit for an action (distributed version)
 * Uses Supabase for atomic rate limiting across serverless instances
 */
async function distributedRateLimit(
    action: string,
    identifier: string,
    limit: number,
    windowMs: number
): Promise<RateLimitResult> {
    const supabase = getRateLimitClient()
    if (!supabase) {
        // SECURITY: Fall back to in-memory rate limiting. Per-instance counters are imperfect
        // but vastly better than blocking all users (fail-closed) or no limiting at all.
        console.error('[SECURITY] Rate limiter has no Supabase client — falling back to in-memory (per-instance only)')
        return inMemoryRateLimit(action, identifier, limit, windowMs)
    }

    const key = `${action}:${identifier}`
    const now = new Date()
    const windowStart = new Date(now.getTime() - windowMs)

    try {
        // Use a database function for atomic rate limiting
        // First, clean up old entries and count recent ones
        const { data, error } = await supabase.rpc('check_rate_limit', {
            p_key: key,
            p_limit: limit,
            p_window_start: windowStart.toISOString(),
            p_now: now.toISOString()
        })

        if (error) {
            // SECURITY: Fall back to in-memory. Logging at error level so monitoring catches
            // distributed-coordination loss. In-memory still provides per-instance protection.
            console.error('[SECURITY] Rate limit RPC failed — falling back to in-memory (per-instance only):', error.message)
            return inMemoryRateLimit(action, identifier, limit, windowMs)
        }

        const result = data as { allowed: boolean; count: number; reset_at: string }

        if (!result.allowed) {
            const resetTime = new Date(result.reset_at).getTime()
            const secondsUntilReset = Math.ceil((resetTime - now.getTime()) / 1000)
            return {
                success: false,
                remaining: 0,
                resetTime,
                error: `Rate limit exceeded. Try again in ${secondsUntilReset} seconds.`
            }
        }

        return {
            success: true,
            remaining: limit - result.count,
            resetTime: now.getTime() + windowMs
        }
    } catch (err) {
        // SECURITY: Fall back to in-memory on unexpected errors
        console.error('[SECURITY] Rate limiter unexpected error — falling back to in-memory (per-instance only):', err)
        return inMemoryRateLimit(action, identifier, limit, windowMs)
    }
}

/**
 * In-memory rate limiting (fallback for development)
 */
function inMemoryRateLimit(
    action: string,
    identifier: string,
    limit: number,
    windowMs: number
): RateLimitResult {
    const key = `ratelimit:${action}:${identifier}`
    const now = Date.now()
    
    // Get or create entry
    let entry = rateLimitStore.get(key)
    
    if (!entry || now > entry.resetTime) {
        // Create new entry or reset expired entry
        entry = { count: 0, resetTime: now + windowMs }
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
    
    // Use distributed rate limiting in production
    if (useDistributed) {
        return distributedRateLimit(action, identifier, limit, window)
    }
    
    // Fall back to in-memory for development
    return inMemoryRateLimit(action, identifier, limit, window)
}

/**
 * Get the client IP address from request headers.
 *
 * SECURITY: Header trust order matters. `x-real-ip` and `x-vercel-forwarded-for`
 * are set by the platform (Vercel/nginx) and cannot be spoofed by clients.
 * `x-forwarded-for` CAN be spoofed if not behind a trusted proxy — when used as
 * fallback, we take the LAST entry (closest to the proxy, hardest to spoof).
 */
export function getClientIP(headers: Headers): string {
    // SECURITY: Prefer platform-set headers that cannot be spoofed by clients

    // Vercel sets x-real-ip to the true client IP
    const realIp = headers.get('x-real-ip')
    if (realIp) return realIp

    // Vercel's own forwarded header
    const vercelIp = headers.get('x-vercel-forwarded-for')
    if (vercelIp) {
        return vercelIp.split(',')[0].trim()
    }

    // Cloudflare
    const cfIp = headers.get('cf-connecting-ip')
    if (cfIp) return cfIp

    // SECURITY: x-forwarded-for is client-spoofable — take the LAST entry
    // (rightmost IP is added by the closest trusted proxy)
    const forwarded = headers.get('x-forwarded-for')
    if (forwarded) {
        const ips = forwarded.split(',').map(s => s.trim())
        return ips[ips.length - 1] || 'unknown'
    }

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
    // Clear in-memory fallback
    const memKey = `ratelimit:${action}:${identifier}`
    rateLimitStore.delete(memKey)

    // SECURITY: Also clear distributed store in production
    if (useDistributed) {
        const supabase = getRateLimitClient()
        if (supabase) {
            const distKey = `${action}:${identifier}`
            try {
                await supabase.rpc('reset_rate_limit', { p_key: distKey })
            } catch (err) {
                console.warn('[SECURITY] Failed to reset distributed rate limit:', err)
            }
        }
    }
}
