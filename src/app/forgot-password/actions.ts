'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { rateLimit, getClientIP } from '@/lib/security/rate-limit'
import { sanitizeEmail } from '@/lib/security/sanitize'

export async function requestPasswordReset(formData: FormData) {
    const headersList = await headers()
    const clientIP = getClientIP(headersList)

    // Rate limit password reset requests
    const rateLimitResult = await rateLimit('passwordReset', clientIP)
    if (!rateLimitResult.success) {
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
    const origin = headersList.get('origin') || headersList.get('x-forwarded-host') || 'https://fractionalforge.app'
    const redirectTo = `${origin.startsWith('http') ? origin : `https://${origin}`}/auth/callback?next=/update-password`

    await supabase.auth.resetPasswordForEmail(email, { redirectTo })

    redirect('/forgot-password?status=sent')
}
