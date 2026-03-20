import { createClient } from '@/lib/supabase/server'
import { ClaimView } from './claim-view'
import { getListingPreviewByToken } from '@/actions/listing-claims'
import type { Metadata } from 'next'

export async function generateMetadata({
    params,
}: {
    params: Promise<{ token: string }>
}): Promise<Metadata> {
    const { token } = await params
    const preview = await getListingPreviewByToken(token)
    const companyName = preview.data?.title

    return {
        title: companyName
            ? `${companyName} on Fractional Forge`
            : 'Claim Your Listing | Fractional Forge',
        description: 'Verify and update your company listing on Fractional Forge',
    }
}

/**
 * Public claim page — fetches listing preview server-side for instant render.
 *
 * @description Unauthenticated users see listing data + value props + signup CTA.
 * Authenticated users see listing data + "Claim This Listing" button.
 */
export default async function ClaimPage({
    params,
}: {
    params: Promise<{ token: string }>
}): Promise<React.ReactNode> {
    const { token } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const preview = await getListingPreviewByToken(token)

    return (
        <ClaimView
            token={token}
            isAuthenticated={!!user}
            preview={preview.data ?? null}
            previewError={preview.error ?? null}
        />
    )
}
