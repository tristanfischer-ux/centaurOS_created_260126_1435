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
        // SECURITY: Log rate limit exceeded event
        await logSecurityEvent({
            type: 'RATE_LIMIT_EXCEEDED',
            ipAddress: clientIP,
            resource: 'login',
            action: 'login_attempt',
            success: false,
            details: { 
                remaining: rateLimitResult.remaining,
                resetIn: rateLimitResult.resetTime 
            }
        })
        redirect(`/login?error=${encodeURIComponent('Too many login attempts. Please try again in 15 minutes.')}`)
    }

    const supabase = await createClient()

    const rawEmail = formData.get('email') as string
    const password = formData.get('password') as string

    // Security: Validate and sanitize email
    const email = sanitizeEmail(rawEmail)
    if (!email) {
        redirect('/login?error=Invalid email address')
    }

    // Security: Password validation with strength requirements
    if (!password) {
        redirect('/login?error=Password is required')
    }
    
    // Check password length (min 8 characters for security)
    if (password.length < 8) {
        redirect('/login?error=Password must be at least 8 characters')
    }
    
    // Check password max length (prevent DoS with extremely long passwords)
    if (password.length > 128) {
        redirect('/login?error=Password is too long')
    }

    const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
    })

    if (error) {
        // Security: Log failed login attempt
        const userAgentHeader = headersList.get('user-agent') || undefined
        await logFailedLogin(email, clientIP, userAgentHeader, error.message)
        redirect('/login?error=Invalid email or password')
    }

    // Success - log and reset rate limit for this IP
    const { data: { user: loggedInUser } } = await supabase.auth.getUser()
    if (loggedInUser) {
        const userAgentHeader = headersList.get('user-agent') || undefined
        await logSuccessfulLogin(loggedInUser.id, email, clientIP, userAgentHeader)
    }
    await resetRateLimit('login', clientIP)

    revalidatePath('/', 'layout')
    
    // Check user's account type and foundry memberships to determine redirect
    if (loggedInUser) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('account_type, active_foundry_id')
            .eq('id', loggedInUser.id)
            .single()
        
        // Suppliers go to their dedicated portal
        if (profile?.account_type === 'supplier') {
            redirect('/supplier-portal')
        }

        // Check how many foundries the user belongs to
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { count } = await supabase
            .from('foundry_memberships')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', loggedInUser.id)

        const foundryCount = count || 0

        // Multiple foundries and no active one selected - show workspace picker
        if (foundryCount > 1 && !profile?.active_foundry_id) {
            redirect('/workspace-picker')
        }

        // Single foundry or active foundry set - go to personal dashboard
        if (foundryCount >= 1) {
            redirect('/me')
        }
    }
    
    // Default: users without foundry memberships
    redirect('/me')
}
