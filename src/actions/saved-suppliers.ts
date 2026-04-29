/**
 * @file saved-suppliers.ts
 *
 * @description Server actions for saving / unsaving supplier listings.
 * Reuses the existing `saved_marketplace_listings` table (user_id + listing_id)
 * which already has RLS policies: INSERT / DELETE / SELECT scoped to auth.uid().
 *
 * No migration needed — the table already exists.
 *
 * @security All actions require an authenticated user via withAuth.
 */

'use server'

import { withAuth } from '@/lib/server-action-utils'

// ---------------------------------------------------------------------------
// Save a supplier listing
// ---------------------------------------------------------------------------

/**
 * Save a supplier listing for the authenticated user.
 *
 * @param listingId - marketplace_listings.id (UUID)
 * @returns { ok: true } or { ok: false, error: string }
 */
export async function saveSupplierListing(
  listingId: string
): Promise<{ ok: boolean; error?: string }> {
  return withAuth(async ({ supabase, user }) => {
    // Upsert — idempotent if already saved
    const { error } = await supabase
      .from('saved_marketplace_listings')
      .upsert(
        { user_id: user.id, listing_id: listingId },
        { onConflict: 'user_id,listing_id', ignoreDuplicates: true }
      )

    if (error) {
      console.error('[saveSupplierListing] error:', error.message)
      return { ok: false, error: 'Could not save supplier — please try again.' }
    }

    return { ok: true }
  })
}

// ---------------------------------------------------------------------------
// Unsave a supplier listing
// ---------------------------------------------------------------------------

/**
 * Remove a saved supplier listing for the authenticated user.
 *
 * @param listingId - marketplace_listings.id (UUID)
 * @returns { ok: true } or { ok: false, error: string }
 */
export async function unsaveSupplierListing(
  listingId: string
): Promise<{ ok: boolean; error?: string }> {
  return withAuth(async ({ supabase, user }) => {
    const { error } = await supabase
      .from('saved_marketplace_listings')
      .delete()
      .eq('user_id', user.id)
      .eq('listing_id', listingId)

    if (error) {
      console.error('[unsaveSupplierListing] error:', error.message)
      return { ok: false, error: 'Could not unsave supplier — please try again.' }
    }

    return { ok: true }
  })
}

// ---------------------------------------------------------------------------
// List saved supplier listings for the current user
// ---------------------------------------------------------------------------

/**
 * Returns the set of listing IDs the current user has saved.
 * Used on page load to pre-populate the heart icons.
 *
 * @returns string[] of listing_id UUIDs, or empty array if not authenticated / none saved
 */
export async function getSavedSupplierIds(): Promise<string[]> {
  return withAuth(async ({ supabase, user }) => {
    const { data, error } = await supabase
      .from('saved_marketplace_listings')
      .select('listing_id')
      .eq('user_id', user.id)

    if (error) {
      console.error('[getSavedSupplierIds] error:', error.message)
      return []
    }

    return (data ?? []).map((r: { listing_id: string }) => r.listing_id)
  })
}
