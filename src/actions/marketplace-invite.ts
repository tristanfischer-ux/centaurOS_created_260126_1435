'use server'

import { createClient } from '@/lib/supabase/server'
import { createInvitation } from '@/actions/invitations'
import type { Database } from '@/types/database.types'

type MemberRole = Database['public']['Enums']['member_role']

/**
 * Invite a marketplace listing creator to join the current user's company.
 *
 * @description Resolves the chain: marketplace_listing -> provider_profiles -> profiles
 * to find the listing creator's email, then delegates to the existing invitation system.
 * Only Founders (and Executives) can invite. Only non-demo listings with a real user
 * behind them can be invited.
 *
 * @param listingId - The marketplace listing ID to invite from
 * @returns Object with success status and optional error message
 *
 * @security Requires authenticated Founder user with an active foundry
 */
export async function inviteFromMarketplace(listingId: string): Promise<{
  success: boolean
  personName?: string
  error?: string
}> {
  const supabase = await createClient()

  // AUTH: Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Please sign in first' }
  }

  // Get current user's role — only Founders/Executives can invite
  const { data: currentProfile, error: profileError } = await supabase
    .from('profiles')
    .select('role, foundry_id')
    .eq('id', user.id)
    .single()

  if (profileError || !currentProfile) {
    return { success: false, error: 'Failed to verify your permissions' }
  }

  if (currentProfile.role !== 'Founder' && currentProfile.role !== 'Executive') {
    return { success: false, error: 'Only Founders and Executives can invite team members' }
  }

  // Look up the marketplace listing to get the provider_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: listing, error: listingError } = await (supabase as any)
    .from('marketplace_listings')
    .select('id, title, is_demo, created_by_provider_id')
    .eq('id', listingId)
    .single()

  if (listingError || !listing) {
    return { success: false, error: 'Listing not found' }
  }

  // VALIDATION: Cannot invite from demo listings
  if (listing.is_demo) {
    return { success: false, error: 'This is a sample listing and cannot be invited' }
  }

  // VALIDATION: Listing must be linked to a real provider
  if (!listing.created_by_provider_id) {
    return { success: false, error: 'This listing is not linked to a user account' }
  }

  // Resolve provider_profiles -> user_id -> profiles.email
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: provider, error: providerError } = await (supabase as any)
    .from('provider_profiles')
    .select('user_id')
    .eq('id', listing.created_by_provider_id)
    .single()

  if (providerError || !provider?.user_id) {
    return { success: false, error: 'Could not find the user behind this listing' }
  }

  // Get the target user's email and role
  const { data: targetProfile, error: targetError } = await supabase
    .from('profiles')
    .select('email, role, full_name')
    .eq('id', provider.user_id)
    .single()

  if (targetError || !targetProfile?.email) {
    return { success: false, error: 'Could not find contact information for this person' }
  }

  // Determine invitation role — preserve their current role
  const inviteRole: MemberRole = targetProfile.role as MemberRole

  // Delegate to the existing invitation system
  const result = await createInvitation(targetProfile.email, inviteRole)

  if (!result.success) {
    return { success: false, error: result.error }
  }

  return {
    success: true,
    personName: targetProfile.full_name || listing.title,
  }
}
