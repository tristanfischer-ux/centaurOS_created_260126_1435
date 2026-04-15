'use server'

/**
 * @file complete-profile-wizard.ts
 *
 * @description Server action for the mandatory profile completion wizard.
 * Saves profile data to profiles table, syncs to marketplace_listings
 * (People category), and marks the wizard as completed in onboarding_data.
 *
 * @security Uses authenticated supabase client. Validates and sanitizes all inputs.
 * Marketplace listing lookup uses provider_profiles.listing_id (user-scoped),
 * NOT title matching (which could hit another user's record).
 */

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { determineFunctionCategory } from '@/lib/recruit-match'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'
import { enrichLinkedInProfile } from '@/actions/enrich-linkedin-profile'
import { embedMarketplaceListing } from '@/lib/search/semantic-search'
import type { OnboardingData } from '@/actions/onboarding'

export interface ProfileWizardInput {
  /** Direct role selection (e.g. "CFO", "CTO", "VP Engineering"). Overrides auto-detected subcategory. */
  executive_role?: string
  /** LinkedIn profile URL — saved to profiles + provider_profiles, used for enrichment */
  linkedin_url?: string
  headline: string
  bio: string
  skills: string[]
  industries: string[]
  years_experience: number
  expertise_areas: string[]
  availability_type: string
  availability_hours_per_week: number | null
  /** Optional day rate (£) — enables direct booking from marketplace */
  day_rate: number | null
}

const VALID_AVAILABILITY_TYPES = ['full-time', 'part-time', 'advisory', 'project-based']
const VALID_EXECUTIVE_ROLES = [
  'CFO', 'CTO', 'COO', 'CMO',
  'VP Engineering', 'VP Manufacturing', 'VP Supply Chain',
  'VP Sales', 'VP Product', 'VP HR',
  'General Counsel', 'Board Advisor', 'Other',
]
const MAX_ARRAY_LENGTH = 20
const MAX_TAG_LENGTH = 100

// SECURITY: Strip HTML tags without encoding entities. React handles output encoding;
// escapeHtml would double-encode ("R&D" → "R&amp;D" → displayed as "R&amp;D").
function stripTags(str: string): string {
  return str.replace(/<[^>]*>/g, '').trim()
}

function sanitizeTag(str: string): string {
  const cleaned = stripTags(str.trim())
  return cleaned.slice(0, MAX_TAG_LENGTH)
}

export async function completeProfileWizard(
  input: ProfileWizardInput
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // ── Validation & Sanitization ─────────────────────────────────────
  const headline = stripTags(input.headline?.trim() || '')
  const bio = stripTags(input.bio?.trim() || '')
  const skills = (input.skills || [])
    .map(sanitizeTag)
    .filter(Boolean)
    .slice(0, MAX_ARRAY_LENGTH)
  const industries = (input.industries || [])
    .map(sanitizeTag)
    .filter(Boolean)
    .slice(0, MAX_ARRAY_LENGTH)
  const expertiseAreas = (input.expertise_areas || [])
    .map(sanitizeTag)
    .filter(Boolean)
    .slice(0, MAX_ARRAY_LENGTH)

  // SECURITY: Allow 0 for apprentices ("Still studying")
  const yearsExperience = typeof input.years_experience === 'number' ? input.years_experience : -1
  const availabilityType = input.availability_type?.trim() || ''
  const hoursPerWeek = typeof input.availability_hours_per_week === 'number'
    ? Math.max(0, Math.min(80, Math.round(input.availability_hours_per_week)))
    : null
  const dayRate = typeof input.day_rate === 'number'
    ? Math.max(0, Math.min(10000, Math.round(input.day_rate)))
    : null

  // SECURITY: Validate LinkedIn URL format — only allow linkedin.com/in/ URLs
  const rawLinkedinUrl = input.linkedin_url?.trim() || ''
  const linkedinUrl = rawLinkedinUrl && /^https?:\/\/(www\.)?linkedin\.com\/in\//i.test(rawLinkedinUrl)
    ? rawLinkedinUrl.slice(0, 200) // Cap length
    : null

  // DECISION: Allow empty headline/bio/skills/industries — users can skip the
  // identity and expertise steps and complete later from My Profile. Only
  // validate length limits when values are provided.
  if (headline && headline.length > 120) {
    return { error: 'Headline must be under 120 characters' }
  }
  if (bio && bio.length > 500) {
    return { error: 'Bio must be under 500 characters' }
  }
  if (yearsExperience < 0 || yearsExperience > 50) {
    return { error: 'Please select your years of experience' }
  }
  if (!VALID_AVAILABILITY_TYPES.includes(availabilityType)) {
    return { error: 'Please select a valid availability type' }
  }

  try {
    // ── Get current profile ───────────────────────────────────────────
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, full_name, onboarding_data')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return { error: 'Failed to load profile' }
    }

    // SECURITY: Idempotency — don't re-process if already completed
    const existingOnboarding = (profile.onboarding_data as OnboardingData) || {}
    if (existingOnboarding.profile_wizard_completed) {
      return { success: true }
    }

    // INTENT: If user explicitly selected a role (e.g. "CFO"), use it as subcategory
    // for marketplace discovery. Fall back to auto-detection from skills/headline.
    const executiveRole = input.executive_role?.trim() || ''
    const validRole = VALID_EXECUTIVE_ROLES.includes(executiveRole) && executiveRole !== 'Other'
    const subcategory = validRole
      ? executiveRole
      : determineFunctionCategory(profile.role || '', headline, skills)

    // ── Update profiles table ─────────────────────────────────────────
    const updatedOnboarding: OnboardingData = {
      ...existingOnboarding,
      profile_wizard_completed: true,
      profile_wizard_completed_at: new Date().toISOString(),
      profile_wizard_draft: undefined,
      checklist_profile_completed: true,
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        headline,
        bio,
        skills,
        industries,
        years_experience: yearsExperience,
        expertise_areas: expertiseAreas,
        availability_type: availabilityType,
        availability_hours_per_week: hoursPerWeek,
        ...(linkedinUrl && { linkedin_url: linkedinUrl }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onboarding_data: updatedOnboarding as any,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (updateError) {
      console.error('[ProfileWizard] Profile update failed:', updateError.message)
      return { error: sanitizeErrorMessage(updateError) }
    }

    // ── Sync to marketplace_listings ─────────────────────────────────
    // SECURITY: Find listing via provider_profiles (user-scoped), NOT by title
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: providerProfile } = await (supabase as any)
      .from('provider_profiles')
      .select('id, listing_id')
      .eq('user_id', user.id)
      .maybeSingle()

    const listingAttributes = {
      role: validRole ? executiveRole : (executiveRole || 'Fractional Executive'),
      skills,
      industries,
      years_experience: yearsExperience,
      headline,
      availability: availabilityType,
      availability_hours_per_week: hoursPerWeek,
      expertise_areas: expertiseAreas,
      // INTENT: Store expertise areas under both keys — 'expertise_areas' for the canonical
      // field and 'expertise' for the marketplace skill filter which queries this key.
      expertise: expertiseAreas,
      ...(dayRate != null && { day_rate: dayRate }),
      ...(linkedinUrl && { linkedin_url: linkedinUrl }),
    }

    if (providerProfile?.listing_id) {
      // Update existing listing — scoped by user's own listing_id
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: listingError } = await (supabase as any)
        .from('marketplace_listings')
        .update({
          description: bio || 'Fractional executive on ForgeOS — view profile for details.',
          subcategory,
          attributes: listingAttributes,
          // INTENT: LinkedIn URL = lightweight identity verification ("claimed" tier).
          // Founders can filter by "Verified Only" to see executives who've linked their profile.
          ...(linkedinUrl && { is_verified: true, verification_tier: 'claimed' }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', providerProfile.listing_id)

      if (listingError) {
        console.error('[ProfileWizard] Listing update failed:', listingError.message)
      } else {
        // FLOW: Re-embed with updated bio/skills/industries — the initial embedding
        // from signup only had sparse "Fractional executive on ForgeOS" text.
        embedMarketplaceListing(providerProfile.listing_id).catch((e: unknown) =>
          console.warn('[ProfileWizard] Re-embed failed (non-blocking):', e)
        )
      }

      // Sync day_rate, headline, and linkedin_url to provider_profiles for booking system
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('provider_profiles')
        .update({
          headline: headline || undefined,
          bio: bio || undefined,
          ...(dayRate != null && { day_rate: dayRate }),
          ...(linkedinUrl && { linkedin_url: linkedinUrl }),
        })
        .eq('id', providerProfile.id)
    } else {
      // Create listing if none exists (Founders don't get one during signup)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: newListing, error: insertError } = await (supabase as any)
        .from('marketplace_listings')
        .insert({
          category: 'People',
          subcategory,
          title: profile.full_name || headline,
          description: bio,
          attributes: listingAttributes,
          is_verified: !!linkedinUrl,
          ...(linkedinUrl && { verification_tier: 'claimed' }),
          is_demo: false,
          is_self_created: true,
          created_by_provider_id: providerProfile?.id || null,
          approval_status: 'approved',
        })
        .select('id')
        .maybeSingle()

      if (insertError) {
        console.error('[ProfileWizard] Listing insert failed:', insertError.message)
      } else if (newListing?.id && providerProfile?.id) {
        // Link listing back to provider profile + sync day_rate, linkedin for booking
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('provider_profiles')
          .update({
            listing_id: newListing.id,
            headline: headline || undefined,
            bio: bio || undefined,
            ...(dayRate != null && { day_rate: dayRate }),
            ...(linkedinUrl && { linkedin_url: linkedinUrl }),
          })
          .eq('id', providerProfile.id)

        // Embed the new listing for semantic search
        embedMarketplaceListing(newListing.id).catch((e: unknown) =>
          console.warn('[ProfileWizard] Embed failed (non-blocking):', e)
        )
      }
    }

    // ── LinkedIn enrichment (fire-and-forget) ─────────────────────────
    // FLOW: If the user provided a LinkedIn URL, kick off async enrichment
    // to pull experience, education, and companies into the listing.
    // Non-blocking — wizard returns immediately, enrichment runs in background.
    if (linkedinUrl) {
      enrichLinkedInProfile().catch((e: unknown) =>
        console.warn('[ProfileWizard] LinkedIn enrichment failed (non-blocking):', e)
      )
    }

    // ── Revalidate ────────────────────────────────────────────────────
    revalidatePath('/', 'layout')
    revalidatePath('/recruits')
    revalidatePath('/marketplace')
    revalidatePath('/my-profile')

    return { success: true }
  } catch (err) {
    console.error('[ProfileWizard] Unexpected error:', err)
    return { error: 'An unexpected error occurred' }
  }
}
