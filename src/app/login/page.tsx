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

export default async function LoginPage(): Promise<React.ReactNode> {
    // AUTH: Redirect already-authenticated users to their dashboard
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
        // Fetch profile to determine the correct redirect destination
        const { data: profile } = await supabase
            .from('profiles')
            .select('account_type, active_foundry_id')
            .eq('id', user.id)
            .single()

        if (profile?.account_type === 'supplier') {
            redirect('/supplier-portal')
        }

        redirect('/today')
    }

    return (
        <Suspense fallback={null}>
            <LoginView />
        </Suspense>
    )
}
