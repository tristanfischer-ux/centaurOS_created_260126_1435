/**
 * @file page.tsx — Login page (server wrapper with auth redirect)
 *
 * @description Forces dynamic rendering and checks for an existing session.
 * If the user is already authenticated (e.g. navigated here after signup
 * with email confirmation disabled), redirects them to their appropriate
 * dashboard instead of showing the login form.
 */

import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { LoginView } from './login-view'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * @description Sanitize redirect path: must start with `/` and must not
 * contain `//` (prevents open-redirect attacks via protocol-relative URLs).
 */
function sanitizeRedirect(raw: string | undefined | null): string | null {
    if (!raw) return null
    if (!raw.startsWith('/') || raw.includes('//')) return null
    return raw
}

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}): Promise<React.ReactNode> {
    const params = await searchParams
    const redirect_raw = typeof params.redirect === 'string' ? params.redirect : undefined
    const redirectTo = sanitizeRedirect(redirect_raw)

    // AUTH: Redirect already-authenticated users to their dashboard
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
        // If there's a valid redirect, send them there first
        if (redirectTo) {
            redirect(redirectTo)
        }

        // DECISION 2026-04-24: post-pivot landing is Brainstorming (/agents).
        // /today stays mounted for deep links but Today-as-default was dropped.
        // Supplier / fractional-executive are opt-in flags, not routing paths.
        redirect('/agents')
    }

    return (
        <Suspense fallback={null}>
            <LoginView redirect={redirectTo} />
        </Suspense>
    )
}
