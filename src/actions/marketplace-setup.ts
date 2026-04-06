'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { determineFunctionCategory } from '@/lib/recruit-match'

/**
 * Creates a marketplace listing for a Founder, Executive, or Apprentice during onboarding.
 *
 * @description Bypasses the standard provider-portal approval flow for trial users.
 * Looks up the user's provider_profiles record (auto-created during signup),
 * creates a People marketplace listing, and links it back to the provider profile.
 * Founders get a simplified listing (no availability); Executives/Apprentices include
 * structured availability (hours/week + start date).
 *
 * @param formData - Form data containing headline, description, skills, and
 *   optionally availability (for Executives/Apprentices)
 * @returns Object with success status and optional error message
 *
 * @security Requires authenticated user with an existing provider profile
 */
export async function createMarketplacePresence(formData: FormData): Promise<{
  success: boolean
  error?: string
}> {
  const supabase = await createClient()

  // AUTH: Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Please sign in first' }
  }

  // Get user profile for role info
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    console.error('[MarketplaceSetup] Failed to fetch profile:', profileError)
    return { success: false, error: 'Failed to load your profile' }
  }

  // VALIDATION: Only trial roles (Founder, Executive, Apprentice) use this flow
  const ALLOWED_ROLES = ['Founder', 'Executive', 'Apprentice']
  if (!ALLOWED_ROLES.includes(profile.role ?? '')) {
    return { success: false, error: 'This setup is for Founders, Executives, and Apprentices' }
  }

  // Get the provider profile (auto-created during signup)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: providerProfile, error: providerError } = await (supabase as any)
    .from('provider_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (providerError || !providerProfile) {
    console.error('[MarketplaceSetup] No provider profile found:', providerError)
    return { success: false, error: 'Provider profile not found. Please contact support.' }
  }

  // Extract form data
  const headline = (formData.get('headline') as string)?.trim()
  const description = (formData.get('description') as string)?.trim()
  const skills = (formData.get('skills') as string)?.trim()
  const availability = (formData.get('availability') as string)?.trim()

  // VALIDATION: Require at least a headline
  if (!headline) {
    return { success: false, error: 'Please provide a headline for your listing' }
  }

  // Parse skills into an array
  const skillsArray = skills
    ? skills.split(',').map((s: string) => s.trim()).filter(Boolean)
    : []

  // DECISION: Subcategory is the person's function category (Engineering, Finance, etc.)
  // derived from their headline and skills. More useful than the old Executive/Apprentice label.
  const subcategory = determineFunctionCategory(
    (profile.role as string) || '',
    headline,
    skillsArray
  )

  // Build attributes — availability is optional for Founders
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attributes: Record<string, any> = {
    role: headline,
    skills: skillsArray,
    provider_id: providerProfile.id,
  }

  // Only include availability for Executives/Apprentices (Founders don't sell their time)
  if (availability && profile.role !== 'Founder') {
    attributes.availability = availability
  }

  // Create the marketplace listing — auto-approved for trial
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: listing, error: listingError } = await (supabase as any)
    .from('marketplace_listings')
    .insert({
      category: 'People',
      subcategory,
      title: profile.full_name || headline,
      description: description || `${headline} available on ForgeOS`,
      attributes,
      is_verified: false,
      is_demo: false,
      is_self_created: true,
      created_by_provider_id: providerProfile.id,
      approval_status: 'approved', // Auto-approve for trial
    })
    .select('id')
    .single()

  if (listingError) {
    console.error('[MarketplaceSetup] Failed to create listing:', listingError)
    return { success: false, error: 'Failed to create your marketplace listing' }
  }

  // Link the listing back to the provider profile
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('provider_profiles')
    .update({
      listing_id: listing.id,
      headline,
      bio: description,
    })
    .eq('id', providerProfile.id)

  // Mark onboarding step as complete in profile
  await supabase
    .from('profiles')
    .update({
      onboarding_data: {
        marketplace_setup_complete: true,
        marketplace_listing_id: listing.id,
      } as unknown as Record<string, unknown>,
    } as Record<string, unknown>)
    .eq('id', user.id)

  revalidatePath('/marketplace')
  revalidatePath('/recruits')

  return { success: true }
}
