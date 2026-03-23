'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { rateLimit, getClientIP, resetRateLimit } from '@/lib/security/rate-limit'
import { sanitizeEmail } from '@/lib/security/sanitize'
import { logFailedLogin, logSuccessfulLogin, logSecurityEvent } from '@/lib/security/audit-log'

export async function login(formData: FormData) {
    // Security: Get client IP for rate limiting
    const headersList = await headers()
    const clientIP = getClientIP(headersList)

    // Security: Rate limit login attempts
    const rateLimitResult = await rateLimit('login', clientIP)
    if (!rateLimitResult.success) {
        // SECURITY: Log rate limit exceeded event (fire-and-forget — don't block redirect)
        logSecurityEvent({
            type: 'RATE_LIMIT_EXCEEDED',
            ipAddress: clientIP,
            resource: 'login',
            action: 'login_attempt',
            success: false,
            details: {
                remaining: rateLimitResult.remaining,
                resetIn: rateLimitResult.resetTime
            }
        }).catch((err) => console.error('[LOGIN] Rate limit audit log error:', err))
        redirect('/login?error=rate-limited')
    }

    const supabase = await createClient()

    const rawEmail = formData.get('email') as string
    const password = formData.get('password') as string

    // Security: Validate and sanitize email
    const email = sanitizeEmail(rawEmail)
    if (!email) {
        redirect('/login?error=invalid-email')
    }

    // Security: Password validation with strength requirements
    if (!password) {
        redirect('/login?error=password-required')
    }

    // Check password length (min 8 characters for security)
    if (password.length < 8) {
        redirect('/login?error=password-too-short')
    }

    // Check password max length (prevent DoS with extremely long passwords)
    if (password.length > 128) {
        redirect('/login?error=password-too-long')
    }

    const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
    })

    if (error) {
        // Security: Log failed login attempt (fire-and-forget — don't block error redirect)
        const userAgentHeader = headersList.get('user-agent') || undefined
        logFailedLogin(email, clientIP, userAgentHeader, error.message)
            .catch((err) => console.error('[LOGIN] Failed login audit log error:', err))

        // INTENT: Surface specific, actionable errors instead of a generic message.
        // "Email not confirmed" is safe to reveal — it doesn't leak whether the account exists
        // because signup already confirms the email was registered.
        if (error.message?.toLowerCase().includes('email not confirmed')) {
            redirect('/login?error=email-not-confirmed')
        }
        redirect('/login?error=invalid-credentials')
    }

    // Success - log and reset rate limit for this IP
    const { data: { user: loggedInUser } } = await supabase.auth.getUser()

    // DECISION: Fire-and-forget for audit log + rate limit reset.
    // These are non-critical and call Supabase RPCs that can hang under load,
    // which blocks redirect() and makes the login form appear frozen.
    if (loggedInUser) {
        const userAgentHeader = headersList.get('user-agent') || undefined
        logSuccessfulLogin(loggedInUser.id, email, clientIP, userAgentHeader)
            .catch((err) => console.error('[LOGIN] Audit log failed:', err))
    }
    resetRateLimit('login', clientIP)
        .catch((err) => console.error('[LOGIN] Rate limit reset failed:', err))

    revalidatePath('/', 'layout')

    // INTENT: If the user was redirected to login from a protected page,
    // send them back there after successful auth.
    const redirectRaw = formData.get('redirect') as string | null
    const redirectTo = redirectRaw && redirectRaw.startsWith('/') && !redirectRaw.includes('//')
        ? redirectRaw
        : null

    // Check user's account type and foundry memberships to determine redirect
    if (loggedInUser) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('account_type, active_foundry_id')
            .eq('id', loggedInUser.id)
            .single()
        
        // INTENT: Honor the redirect param first — suppliers may be returning
        // to a claim page after login, and must not be short-circuited.
        if (redirectTo) {
            redirect(redirectTo)
        }

        // Suppliers go to their dedicated portal (only when no redirect)
        if (profile?.account_type === 'supplier') {
            redirect('/supplier-portal')
        }

        // Check how many foundries the user belongs to
        const { count } = await supabase
            .from('foundry_memberships')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', loggedInUser.id)

        const foundryCount = count || 0

        // Multiple foundries - always show workspace picker so user chooses
        if (foundryCount > 1) {
            redirect('/workspace-picker')
        }

        // Single foundry or active foundry set - go to Today page
        if (foundryCount >= 1) {
            redirect('/today')
        }
    }
    
    // Default: users without foundry memberships
    redirect('/today')
}
