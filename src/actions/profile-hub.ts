'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Json } from '@/types/database.types'

/**
 * Profile hub data shape returned by getProfileHubData.
 * Used by the my-profile page to render the full profile hub.
 */
export interface ProfileHubData {
  profile: {
    id: string
    email: string
    full_name: string | null
    role: string
    avatar_url: string | null
    account_type: string | null
    foundry_id: string | null
    created_at: string | null
    bio: string | null
    phone_number: string | null
    linkedin_url: string | null
    professional_background: Record<string, unknown> | null | Json
  } | null
  providerProfile: {
    id: string
    headline: string | null
    bio: string | null
    day_rate: number | null
    hourly_rate: number | null
    currency: string | null
    tier: string | null
    location: string | null
    years_experience: number | null
    specializations: string[] | null
    industries: string[] | null
    company_stages: string[] | null
    profile_slug: string | null
    is_public: boolean | null
    video_url: string | null
    linkedin_url: string | null
    website_url: string | null
    is_active: boolean | null
    listing_id: string | null
    stripe_onboarding_complete: boolean | null
    max_concurrent_orders: number | null
    timezone: string | null
  } | null
  listing: {
    id: string
    title: string | null
    description: string | null
    category: string | null
    subcategory: string | null
    image_url: string | null
    approval_status: string | null
  } | null
  strength: {
    score: number
    sections: Array<{
      name: string
      weight: number
      completed: boolean
      suggestion: string
    }>
  }
  isProvider: boolean
  foundryName: string | null
  stats: {
    totalTasks: number
    completedTasks: number
    objectives: number
    teamSize: number
  }
}

/**
 * Get unified profile data for the profile hub.
 *
 * @description Merges data from profiles, provider_profiles, marketplace_listings,
 * and aggregates user activity stats (tasks, objectives, team size).
 *
 * @returns {Promise<ProfileHubData | null>} Complete profile hub data or null if unauthenticated
 *
 * @security Requires authenticated user. Stats scoped to user's foundry.
 */
export async function getProfileHubData(): Promise<ProfileHubData | null> {
  const supabase = await createClient()

  // AUTH: Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Fetch profile, provider profile in parallel
  const [profileResult, providerResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, full_name, role, avatar_url, account_type, foundry_id, created_at, bio, phone_number, linkedin_url, professional_background')
      .eq('id', user.id)
      .single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase
      .from('provider_profiles')
      .select(`
        id, headline, bio, day_rate, hourly_rate, currency, 
        tier, location, years_experience, specializations, industries,
        company_stages, profile_slug, is_public, video_url, linkedin_url, 
        website_url, is_active, listing_id, stripe_onboarding_complete,
        max_concurrent_orders, timezone
      `)
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  const profile = profileResult.data
  const providerProfile = providerResult.data
  const foundryId = profile?.foundry_id

  // Fetch listing, foundry name, and stats in parallel
  const [listingResult, foundryResult, taskCountResult, completedTaskResult, objectiveCountResult, teamCountResult] = await Promise.all([
    // Get listing if provider has one
    providerProfile?.listing_id
      ? supabase
          .from('marketplace_listings')
          .select('id, title, description, category, subcategory, image_url, approval_status')
          .eq('id', providerProfile.listing_id)
          .single()
      : Promise.resolve({ data: null }),
    // Get foundry name (maybeSingle avoids error when RLS returns 0 rows)
    foundryId
      ? supabase
          .from('foundries')
          .select('name')
          .eq('id', foundryId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // Task counts (scoped to foundry)
    foundryId
      ? supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('foundry_id', foundryId)
          .eq('is_ghost', false)
          .is('deleted_at', null)
          .eq('assignee_id', user.id)
      : Promise.resolve({ count: 0 }),
    foundryId
      ? supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('foundry_id', foundryId)
          .eq('is_ghost', false)
          .is('deleted_at', null)
          .eq('assignee_id', user.id)
          .eq('status', 'Completed')
      : Promise.resolve({ count: 0 }),
    // Objectives count
    foundryId
      ? supabase
          .from('objectives')
          .select('id', { count: 'exact', head: true })
          .eq('foundry_id', foundryId)
          .eq('is_ghost', false)
          .is('deleted_at', null)
          .eq('creator_id', user.id)
      : Promise.resolve({ count: 0 }),
    // Team size
    foundryId
      ? supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('foundry_id', foundryId)
      : Promise.resolve({ count: 0 }),
  ])

  const listing = listingResult?.data ?? null
  const foundryName = foundryResult?.data?.name ?? null

  const stats = {
    totalTasks: taskCountResult?.count ?? 0,
    completedTasks: completedTaskResult?.count ?? 0,
    objectives: objectiveCountResult?.count ?? 0,
    teamSize: teamCountResult?.count ?? 0,
  }

  // Calculate profile strength (only meaningful for providers)
  const strength = calculateProfileStrength(profile, providerProfile, listing)

  return {
    profile,
    providerProfile,
    listing,
    strength,
    isProvider: !!providerProfile,
    foundryName,
    stats,
  }
}

/**
 * Calculate profile strength (0-100) with specific improvement suggestions.
 *
 * @description Scores provider profiles based on completeness across 10 dimensions.
 * Only meaningful for users with a provider profile.
 */
function calculateProfileStrength(
  profile: Record<string, unknown> | null,
  provider: Record<string, unknown> | null,
  listing: Record<string, unknown> | null,
): {
  score: number
  sections: Array<{
    name: string
    weight: number
    completed: boolean
    suggestion: string
  }>
} {
  const sections = [
    {
      name: 'Profile Photo',
      weight: 10,
      completed: !!(profile?.avatar_url),
      suggestion: 'Profiles with a professional photo get 5x more engagement. Use a clear headshot with good lighting.',
    },
    {
      name: 'Headline',
      weight: 15,
      completed: !!(provider?.headline),
      suggestion: 'Your headline is the first thing people see. Example: "Fractional CFO | Helping hardware startups scale from seed to Series B"',
    },
    {
      name: 'Bio',
      weight: 15,
      completed: !!(provider?.bio && (provider.bio as string).length > 50),
      suggestion: 'A compelling bio tells your story. Aim for 150-300 words covering your expertise, approach, and notable achievements.',
    },
    {
      name: 'Day Rate',
      weight: 10,
      completed: !!(provider?.day_rate),
      suggestion: 'Setting your rate helps buyers filter and find you. You can always negotiate on specific projects.',
    },
    {
      name: 'Experience',
      weight: 10,
      completed: !!(provider?.years_experience),
      suggestion: 'Years of experience builds trust. Buyers often filter by experience level.',
    },
    {
      name: 'Skills & Specializations',
      weight: 10,
      completed: !!(provider?.specializations && (provider.specializations as string[]).length > 0),
      suggestion: 'Add at least 3-5 specializations so buyers can find you when searching for specific expertise.',
    },
    {
      name: 'Location',
      weight: 5,
      completed: !!(provider?.location),
      suggestion: 'Your location helps with timezone matching and local regulations.',
    },
    {
      name: 'LinkedIn Profile',
      weight: 5,
      completed: !!(provider?.linkedin_url),
      suggestion: 'Linking your LinkedIn adds credibility and helps buyers verify your background.',
    },
    {
      name: 'Marketplace Listing',
      weight: 15,
      completed: !!(listing && listing.approval_status === 'approved'),
      suggestion: 'Create a marketplace listing to be discoverable by buyers searching for services.',
    },
    {
      name: 'Payment Setup',
      weight: 5,
      completed: !!(provider?.stripe_onboarding_complete),
      suggestion: 'Connect Stripe so you can receive payments when clients hire you.',
    },
  ]

  const score = sections.reduce(
    (acc, section) => acc + (section.completed ? section.weight : 0),
    0
  )

  return { score, sections }
}

/**
 * Update the user's marketplace profile information.
 *
 * @description Updates or creates a provider profile with the supplied fields.
 * All fields are optional - only provided values are updated.
 *
 * @param {FormData} formData - Form data with profile fields
 * @returns {Promise<{success: boolean; error?: string}>}
 *
 * @security Requires authenticated user. Updates scoped to own profile.
 */
export async function updateMarketplaceProfile(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  // AUTH: Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const headline = formData.get('headline') as string | null
  const bio = formData.get('bio') as string | null
  const dayRate = formData.get('dayRate') ? Number(formData.get('dayRate')) : null
  const currency = formData.get('currency') as string | null
  const location = formData.get('location') as string | null
  const yearsExperience = formData.get('yearsExperience') ? Number(formData.get('yearsExperience')) : null
  const linkedinUrl = formData.get('linkedinUrl') as string | null
  const websiteUrl = formData.get('websiteUrl') as string | null
  const timezone = formData.get('timezone') as string | null
  const specializationsRaw = formData.get('specializations') as string | null
  const specializations = specializationsRaw ? specializationsRaw.split(',').map(s => s.trim()).filter(Boolean) : null

  // VALIDATION: Headline length
  if (headline && headline.length > 100) {
    return { success: false, error: 'Headline must be 100 characters or less' }
  }

  // VALIDATION: Bio length
  if (bio && bio.length > 2000) {
    return { success: false, error: 'Bio must be 2000 characters or less' }
  }

  // VALIDATION: LinkedIn URL must be a valid linkedin.com URL
  if (linkedinUrl) {
    try {
      const url = new URL(linkedinUrl)
      if (url.hostname !== 'linkedin.com' && !url.hostname.endsWith('.linkedin.com')) {
        return { success: false, error: 'LinkedIn URL must be a linkedin.com link' }
      }
    } catch {
      return { success: false, error: 'LinkedIn URL must be a valid URL (e.g. https://linkedin.com/in/yourname)' }
    }
  }

  // VALIDATION: Numeric fields — guard against NaN and negative values
  if (dayRate !== null && (isNaN(dayRate) || dayRate < 0)) {
    return { success: false, error: 'Day rate must be a non-negative number' }
  }
  if (yearsExperience !== null && (isNaN(yearsExperience) || yearsExperience < 0)) {
    return { success: false, error: 'Years of experience must be a non-negative number' }
  }

  // Check if provider profile exists
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await supabase
    .from('provider_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    // Update existing provider profile
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {}
    if (headline !== null) updateData.headline = headline
    if (bio !== null) updateData.bio = bio
    if (dayRate !== null) updateData.day_rate = dayRate
    if (currency !== null) updateData.currency = currency
    if (location !== null) updateData.location = location
    if (yearsExperience !== null) updateData.years_experience = yearsExperience
    if (linkedinUrl !== null) updateData.linkedin_url = linkedinUrl
    if (websiteUrl !== null) updateData.website_url = websiteUrl
    if (timezone !== null) updateData.timezone = timezone
    if (specializations !== null) updateData.specializations = specializations

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase
      .from('provider_profiles')
      .update(updateData)
      .eq('user_id', user.id)

    if (error) {
      console.error('[ProfileHub] Failed to update provider profile:', {
        userId: user.id,
        error: error.message,
      })
      return { success: false, error: 'Failed to update profile' }
    }
  } else {
    // Create new provider profile
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase
      .from('provider_profiles')
      .insert({
        user_id: user.id,
        headline: headline || null,
        bio: bio || null,
        day_rate: dayRate ?? null,
        currency: currency || 'GBP',
        location: location || null,
        years_experience: yearsExperience ?? null,
        linkedin_url: linkedinUrl || null,
        website_url: websiteUrl || null,
        timezone: timezone || 'Europe/London',
        specializations: specializations || [],
        tier: 'pending',
        is_active: true,
        stripe_onboarding_complete: false,
        max_concurrent_orders: 5,
        current_order_count: 0,
        auto_pause_at_capacity: true,
      })

    if (error) {
      console.error('[ProfileHub] Failed to create provider profile:', {
        userId: user.id,
        error: error.message,
      })
      return { success: false, error: 'Failed to create profile' }
    }
  }

  revalidatePath('/my-profile')
  return { success: true }
}

/**
 * Update basic profile fields on the profiles table.
 *
 * @description Updates the user's own basic profile fields (name, bio, phone, LinkedIn).
 * Available to ALL user roles — this is the primary profile editing action.
 *
 * @param {Object} data - Profile fields to update
 * @param {string} data.fullName - User's full name (required, non-empty)
 * @param {string | null} data.bio - User's bio/about text
 * @param {string | null} data.phoneNumber - User's phone number
 * @param {string | null} data.linkedinUrl - User's LinkedIn URL
 *
 * @returns {Promise<{success: boolean; error?: string}>}
 *
 * @security Requires authenticated user. Updates scoped to own profile only.
 */
export async function updateBasicProfile(data: {
  fullName: string
  bio: string | null
  phoneNumber: string | null
  linkedinUrl: string | null
  professionalBackground?: {
    summary: string | null
    previous_companies: string | null
    education: string | null
  } | null
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  // AUTH: Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  // VALIDATION: Name is required
  if (!data.fullName.trim()) {
    return { success: false, error: 'Full name is required' }
  }

  // VALIDATION: Bio length
  if (data.bio && data.bio.length > 2000) {
    return { success: false, error: 'Bio must be 2000 characters or less' }
  }

  // VALIDATION: LinkedIn URL must be a valid linkedin.com URL
  if (data.linkedinUrl) {
    try {
      const url = new URL(data.linkedinUrl)
      if (url.hostname !== 'linkedin.com' && !url.hostname.endsWith('.linkedin.com')) {
        return { success: false, error: 'LinkedIn URL must be a linkedin.com link' }
      }
    } catch {
      return { success: false, error: 'LinkedIn URL must be a valid URL (e.g. https://linkedin.com/in/yourname)' }
    }
  }

  // Build update payload — include professional_background only if provided
  const updatePayload: Record<string, unknown> = {
    full_name: data.fullName.trim(),
    bio: data.bio || null,
    phone_number: data.phoneNumber || null,
    linkedin_url: data.linkedinUrl || null,
    updated_at: new Date().toISOString(),
  }

  // Only include professional_background if explicitly provided (not undefined)
  if (data.professionalBackground !== undefined) {
    updatePayload.professional_background = data.professionalBackground
  }

  const { error } = await supabase
    .from('profiles')
    .update(updatePayload)
    .eq('id', user.id)

  if (error) {
    console.error('[ProfileHub] Failed to update basic profile:', {
      userId: user.id,
      error: error.message,
    })
    return { success: false, error: 'Failed to update profile' }
  }

  revalidatePath('/my-profile')
  revalidatePath('/team')
  return { success: true }
}

/**
 * Upload a user avatar to Supabase Storage and update the profile.
 *
 * @description Handles avatar upload: validates the file, uploads to the
 * `avatars` bucket under the user's folder, and updates `profiles.avatar_url`.
 * Replaces any existing avatar.
 *
 * @param {FormData} formData - Must contain a 'file' field with the image
 * @returns {Promise<{success: boolean; error?: string; avatarUrl?: string}>}
 *
 * @security Requires authenticated user. Uploads scoped to own user ID folder.
 */
export async function uploadAvatar(formData: FormData): Promise<{
  success: boolean
  error?: string
  avatarUrl?: string
}> {
  const supabase = await createClient()

  // AUTH: Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const file = formData.get('file') as File | null
  if (!file) return { success: false, error: 'No file provided' }

  // VALIDATION: Check file size (5MB max)
  if (file.size > 5 * 1024 * 1024) {
    return { success: false, error: 'File must be smaller than 5MB' }
  }

  // VALIDATION: Check mime type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  if (!allowedTypes.includes(file.type)) {
    return { success: false, error: 'File must be a JPEG, PNG, GIF, or WebP image' }
  }

  // SECURITY: Derive extension from validated MIME type, not user-controlled filename
  const mimeExtMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
  }
  const ext = mimeExtMap[file.type] || 'jpg'
  const filePath = `${user.id}/avatar.${ext}`

  // Upload to Supabase Storage (upsert to replace existing)
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, file, {
      upsert: true,
      contentType: file.type,
    })

  if (uploadError) {
    console.error('[ProfileHub] Avatar upload failed:', {
      userId: user.id,
      error: uploadError.message,
    })
    return { success: false, error: 'Failed to upload avatar' }
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('avatars')
    .getPublicUrl(filePath)

  // Bust cache by appending timestamp
  const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`

  // Update profile with new avatar URL
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (updateError) {
    console.error('[ProfileHub] Failed to update avatar URL:', {
      userId: user.id,
      error: updateError.message,
    })
    return { success: false, error: 'Failed to update profile' }
  }

  revalidatePath('/my-profile')
  revalidatePath('/team')
  return { success: true, avatarUrl }
}

/**
 * Generate bio suggestions based on role and experience.
 *
 * @param {string} role - User's role (Executive, Apprentice, supplier)
 * @returns {Promise<string>} Bio template string with placeholders
 */
export async function generateBioTemplate(role: string): Promise<string> {
  const templates: Record<string, string> = {
    Executive: `I help [type of company] achieve [specific outcome] through [your approach/methodology].

With [X years] of experience in [industry/domain], I've [notable achievement or track record]. My approach combines [key strength 1] with [key strength 2] to deliver [measurable result].

Previously, I [key career highlight]. I'm passionate about [what drives you] and work best with [ideal client type].`,
    
    Apprentice: `I'm a motivated [area of study/interest] professional building expertise in [domain].

Currently developing skills in [skill 1], [skill 2], and [skill 3] through hands-on project work. I bring [unique quality] and a fresh perspective to every team I join.

Looking to contribute to [type of projects] where I can [what you want to learn/achieve].`,
    
    supplier: `[Company name] provides [service/product type] for [target market].

With [X years] in business, we specialize in [specific capability 1], [specific capability 2], and [specific capability 3]. Our clients include [example client types].

What sets us apart: [unique differentiator]. We typically deliver within [timeline] and offer [special terms or guarantees].`,
  }

  return templates[role] || templates.Executive
}
