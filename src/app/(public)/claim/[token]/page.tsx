import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ClaimView } from './claim-view'
import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Claim Your Listing | Fractional Forge',
    description: 'Verify and update your company listing on Fractional Forge',
}

/**
 * Public claim page — validates token and shows claim UI.
 *
 * @description Unauthenticated users see the company info and a prompt to sign up/log in.
 * Authenticated users see a "Claim This Listing" button.
 */
export default async function ClaimPage({
    params,
}: {
    params: Promise<{ token: string }>
}): Promise<React.ReactNode> {
    const { token } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    return (
        <ClaimView
            token={token}
            isAuthenticated={!!user}
        />
    )
}
