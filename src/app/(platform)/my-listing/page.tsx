/**
 * @file page.tsx — Self-edit page for claimed marketplace listings.
 *
 * @description Authenticated users who have claimed a listing can edit
 * their company info here. Redirects to login if unauthenticated.
 */

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getMyClaimedListing } from '@/actions/listing-claims'
import { ListingEditor } from './listing-editor'
import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'My Listing',
    description: 'Edit and manage your company listing on ForgeOS',
}

export default async function MyListingPage(): Promise<React.ReactNode> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login?redirect=/my-listing')
    }

    const result = await getMyClaimedListing()

    return (
        <ListingEditor
            listing={result.data ?? null}
            error={result.error ?? null}
        />
    )
}
