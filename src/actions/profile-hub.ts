'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Get unified profile data for the profile hub.
 * Merges data from profiles, provider_profiles, and marketplace_listings.
 */
export async function getProfileHubData() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Fetch profile, provider profile, and listing in parallel
  const [profileResult, providerResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, full_name, role, avatar_url, account_type, onboarding_data, created_at')
      .eq('id', user.id)
      .single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
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

  // Get listing if provider has one
  let listing = null
  if (providerProfile?.listing_id) {
    const { data } = await supabase
      .from('marketplace_listings')
      .select('id, title, description, category, subcategory, image_url, approval_status')
      .eq('id', providerProfile.listing_id)
      .single()
    listing = data
  }

  // Calculate profile strength
  const strength = calculateProfileStrength(profile, providerProfile, listing)

  return {
    profile,
    providerProfile,
    listing,
    strength,
    isProvider: !!providerProfile,
  }
}

/**
 * Calculate profile strength (0-100) with specific improvement suggestions.
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
 */
export async function updateMarketplaceProfile(formData: FormData) {
  const supabase = await createClient()

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

  // Validate headline length
  if (headline && headline.length > 100) {
    return { success: false, error: 'Headline must be 100 characters or less' }
  }

  // Validate bio length
  if (bio && bio.length > 2000) {
    return { success: false, error: 'Bio must be 2000 characters or less' }
  }

  // Check if provider profile exists
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
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
    const { error } = await (supabase as any)
      .from('provider_profiles')
      .update(updateData)
      .eq('user_id', user.id)

    if (error) {
      console.error('Failed to update provider profile:', error)
      return { success: false, error: 'Failed to update profile' }
    }
  } else {
    // Create new provider profile
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('provider_profiles')
      .insert({
        user_id: user.id,
        headline: headline || null,
        bio: bio || null,
        day_rate: dayRate || null,
        currency: currency || 'GBP',
        location: location || null,
        years_experience: yearsExperience || null,
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
      console.error('Failed to create provider profile:', error)
      return { success: false, error: 'Failed to create profile' }
    }
  }

  revalidatePath('/my-profile')
  return { success: true }
}

/**
 * Generate bio suggestions based on role and experience.
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
