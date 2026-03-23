'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { rateLimit, getClientIP, type RateLimitResult } from '@/lib/security/rate-limit'
import { sanitizeEmail } from '@/lib/security/sanitize'

/**
 * Race a promise against a timeout. Returns the fallback if the promise
 * doesn't settle within `ms` milliseconds.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
    ])
}

export async function requestPasswordReset(formData: FormData) {
    const headersList = await headers()
    const clientIP = getClientIP(headersList)

    // SECURITY: 3s timeout on rate limit — don't let a slow DB block the form
    const rateLimitResult = await withTimeout<RateLimitResult>(
        rateLimit('passwordReset', clientIP),
        3000,
        { success: true, remaining: 1, resetTime: 0 },
    )
    if (!rateLimitResult.success) {
        // SECURITY: Always show "sent" to prevent enumeration via rate limit timing
        redirect('/forgot-password?status=sent')
    }

    const rawEmail = formData.get('email') as string
    const email = sanitizeEmail(rawEmail)

    if (!email) {
        redirect('/forgot-password?error=invalid-email')
    }

    const supabase = await createClient()

    // SECURITY: Always show success to prevent email enumeration.
    // If the email doesn't exist, Supabase won't send anything but we still redirect to "sent".
    // SECURITY: Use hardcoded app domain — NEVER trust origin/x-forwarded-host headers.
    // An attacker can spoof these to redirect the password reset link to their domain,
    // stealing the auth code when the victim clicks the link.
    const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN || 'https://fractionalforge.app'
    const redirectTo = `${appDomain}/auth/callback?next=/update-password`

    await supabase.auth.resetPasswordForEmail(email, { redirectTo })

    redirect('/forgot-password?status=sent')
}
