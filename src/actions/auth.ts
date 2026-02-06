'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

/**
 * Sign out the current user with security audit logging.
 */
export async function signOut() {
    const { logSecurityEvent } = await import('@/lib/security/audit-log')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // SECURITY: Log logout event before signing out
    if (user) {
        await logSecurityEvent({ type: 'LOGOUT', userId: user.id, success: true })
    }

    await supabase.auth.signOut()
    redirect('/login')
}
