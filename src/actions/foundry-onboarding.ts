'use server'

/**
 * @file foundry-onboarding.ts — Foundry onboarding server action.
 *
 * @description Creates or updates the authenticated user's foundry from the
 * step-2 onboarding form (`/onboarding/foundry`). Separate from
 * `setup-new-user.ts`: that helper runs once at signup; this action lets a
 * founder name the foundry they are already the owner of, or create a new
 * one if they landed without one.
 *
 * @security Requires authenticated user. Only mutates the user's own profile
 * and the foundry their profile points to.
 *
 * Data contract:
 *   - `foundries` row upsert (id + name + slug + industry + tier keyed on
 *     `id`); `profiles.foundry_id` + `profiles.active_foundry_id` moved to the
 *     new / updated foundry; `foundry_memberships` row ensured (role =
 *     Founder, is_primary = true).
 *   - `onboarding_data.foundry_step_completed_at` stamped so the sidebar can
 *     tick Step 2 as done.
 *
 * Fields persisted from the form:
 *   - name (required)          → `foundries.name`
 *   - slug (required)          → `foundries.slug` and the new foundry `id`
 *                                (only used when a new foundry is created)
 *   - industry (required)      → `foundries.industry`
 *   - tier (required)          → `foundries.tier` (stores team-size bucket)
 *   - headquartersCountry      → NO column on `foundries` today — captured
 *                                on `profiles.onboarding_data.foundry_hq_country`
 *                                as an honest empty placeholder until the
 *                                schema lands it.
 *   - role                     → `foundry_memberships.role` + `profiles.role`
 *   - fiscalYearStart          → NO column on `foundries` today — stored on
 *                                `profiles.onboarding_data.foundry_fiscal_year_start`.
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'
import type { Database, Json } from '@/types/database.types'
import type { OnboardingData } from '@/actions/onboarding'

export type FoundryOnboardingRole = 'Founder' | 'CTO' | 'Head of ops' | 'Engineering lead' | 'Other'
export type FoundryOnboardingTier = 'solo' | '2-5' | '6-15' | '16+'

export interface FoundryOnboardingInput {
  /** Display name. Required. Max 120 chars. */
  name: string
  /** URL slug — lowercase, hyphens only. Required. Max 50 chars. */
  slug: string
  /** Industry free-text tag (e.g., "Hardware", "Biotech"). Required. Max 80 chars. */
  industry: string
  /** Team size bucket, stored on `foundries.tier`. Required. */
  tier: FoundryOnboardingTier
  /** Stored on `profiles.onboarding_data.foundry_hq_country` (no DB column yet). */
  headquartersCountry: string | null
  /** The user's self-reported role within the foundry. */
  role: FoundryOnboardingRole
  /** Stored on `profiles.onboarding_data.foundry_fiscal_year_start` (optional; no DB column yet). */
  fiscalYearStart: string | null
}

export interface FoundryOnboardingResult {
  success: boolean
  error: string | null
  foundryId?: string
}

const NAME_MAX = 120
const SLUG_MAX = 50
const INDUSTRY_MAX = 80
const COUNTRY_MAX = 80
const FISCAL_MAX = 40

function sanitiseSlug(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
}

/**
 * Create or update the user's foundry from the onboarding step-2 form.
 *
 * @returns `{ success, error, foundryId }`. On success the caller redirects
 * to the next onboarding step (product, step 3).
 */
export async function createFoundryFromOnboarding(
  input: FoundryOnboardingInput,
): Promise<FoundryOnboardingResult> {
  // AUTH: Require authenticated user
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { success: false, error: 'You need to sign in to continue.' }
  }

  // VALIDATION
  const name = input.name?.trim() ?? ''
  if (!name) return { success: false, error: 'Foundry name is required.' }
  if (name.length > NAME_MAX) return { success: false, error: `Foundry name must be ${NAME_MAX} characters or fewer.` }

  const slug = sanitiseSlug(input.slug ?? '')
  if (!slug) return { success: false, error: 'URL slug is required (lowercase, hyphens only).' }

  const industry = input.industry?.trim() ?? ''
  if (!industry) return { success: false, error: 'Industry is required.' }
  if (industry.length > INDUSTRY_MAX) return { success: false, error: `Industry must be ${INDUSTRY_MAX} characters or fewer.` }

  const tier = input.tier
  if (tier !== 'solo' && tier !== '2-5' && tier !== '6-15' && tier !== '16+') {
    return { success: false, error: 'Please pick a team-size option.' }
  }

  const role: FoundryOnboardingRole = input.role ?? 'Founder'
  const allowedRoles: readonly FoundryOnboardingRole[] = ['Founder', 'CTO', 'Head of ops', 'Engineering lead', 'Other']
  if (!allowedRoles.includes(role)) {
    return { success: false, error: 'Please pick a role option.' }
  }

  const headquartersCountry = (input.headquartersCountry ?? '').trim().slice(0, COUNTRY_MAX) || null
  const fiscalYearStart = (input.fiscalYearStart ?? '').trim().slice(0, FISCAL_MAX) || null

  // Fetch current profile so we know whether the user already has a foundry.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, foundry_id, onboarding_data, role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    console.error('[foundry-onboarding] Failed to load profile:', {
      userId: user.id,
      error: profileError.message,
    })
    return { success: false, error: 'We could not load your profile. Please refresh and try again.' }
  }

  const existingFoundryId = profile?.foundry_id ?? null
  // INTENT: sandbox / shared workspaces never get renamed — create a real one.
  const isSharedPlaceholder =
    existingFoundryId === 'forge-guild' ||
    existingFoundryId === 'forge-suppliers' ||
    (existingFoundryId ?? '').startsWith('sandbox-')

  let foundryId: string
  let createdFoundry = false

  if (existingFoundryId && !isSharedPlaceholder) {
    // UPDATE PATH — rename / rebrand the existing foundry.
    foundryId = existingFoundryId
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- foundries.tier + slug columns are not in generated insert type
    const { error: updateError } = await (supabase as any)
      .from('foundries')
      .update({
        name,
        slug,
        industry,
        tier,
        updated_at: new Date().toISOString(),
      })
      .eq('id', foundryId)
    if (updateError) {
      console.error('[foundry-onboarding] Failed to update foundry:', {
        userId: user.id,
        foundryId,
        error: updateError.message,
      })
      return {
        success: false,
        error: `Could not save your foundry: ${sanitizeErrorMessage(updateError)}`,
      }
    }
  } else {
    // CREATE PATH — make a new foundry and move the profile to it.
    const candidateId = slug
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- foundries insert columns (slug, owner_id, tier) require cast
    let { data: inserted, error: insertError } = await (supabase as any)
      .from('foundries')
      .insert({
        id: candidateId,
        name,
        slug: candidateId,
        industry,
        tier,
        owner_id: null,
      })
      .select('id')
      .single()

    if (insertError) {
      // 23505 = unique violation. Retry with a disambiguating suffix.
      const retryId = `${candidateId}-${user.id.slice(0, 6)}`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const retry = await (supabase as any)
        .from('foundries')
        .insert({
          id: retryId,
          name,
          slug: retryId,
          industry,
          tier,
          owner_id: null,
        })
        .select('id')
        .single()
      inserted = retry.data
      insertError = retry.error
    }

    if (insertError || !inserted) {
      console.error('[foundry-onboarding] Failed to create foundry:', {
        userId: user.id,
        error: insertError?.message,
      })
      return {
        success: false,
        error: `Could not create your foundry: ${sanitizeErrorMessage(insertError ?? undefined)}`,
      }
    }

    foundryId = inserted.id
    createdFoundry = true

    // Set owner after profile exists so the FK is satisfied in both directions.
    if (profile) {
      const { error: moveError } = await supabase
        .from('profiles')
        .update({
          foundry_id: foundryId,
          active_foundry_id: foundryId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)
      if (moveError) {
        console.error('[foundry-onboarding] Failed to move profile to new foundry:', {
          userId: user.id,
          foundryId,
          error: moveError.message,
        })
        // Roll back the new foundry to avoid orphans.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('foundries').delete().eq('id', foundryId)
        return {
          success: false,
          error: `Could not attach your profile to the new foundry: ${sanitizeErrorMessage(moveError)}`,
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- foundries.owner_id update needs cast
    const { error: ownerError } = await (supabase as any)
      .from('foundries')
      .update({ owner_id: user.id })
      .eq('id', foundryId)
    if (ownerError) {
      // Non-fatal: access is membership-driven, but log it.
      console.warn('[foundry-onboarding] Failed to set foundry owner_id:', {
        userId: user.id,
        foundryId,
        error: ownerError.message,
      })
    }
  }

  // Ensure a Founder membership exists for the user on this foundry.
  const { data: membership } = await supabase
    .from('foundry_memberships')
    .select('id, role, is_primary')
    .eq('user_id', user.id)
    .eq('foundry_id', foundryId)
    .maybeSingle()

  if (!membership) {
    const { error: membershipError } = await supabase
      .from('foundry_memberships')
      .insert({
        user_id: user.id,
        foundry_id: foundryId,
        role: 'Founder' as Database['public']['Enums']['member_role'],
        is_primary: true,
        joined_at: new Date().toISOString(),
      })
    if (membershipError) {
      console.warn('[foundry-onboarding] Failed to create membership:', {
        userId: user.id,
        foundryId,
        error: membershipError.message,
      })
    }
  } else if (!membership.is_primary) {
    await supabase
      .from('foundry_memberships')
      .update({ is_primary: true })
      .eq('id', membership.id)
  }

  // Mark the profile as a Founder (the onboarding form is founder-scoped).
  // Other roles like "CTO", "Head of ops", "Engineering lead", "Other" are
  // captured on `onboarding_data.foundry_self_role` — the `profiles.role`
  // enum only accepts Founder/Executive/Apprentice/Supplier/AI_Agent today.
  await supabase
    .from('profiles')
    .update({ role: 'Founder', updated_at: new Date().toISOString() })
    .eq('id', user.id)

  // Stamp onboarding progress (and stash fields without a schema home yet).
  const existingOnboarding = (profile?.onboarding_data as OnboardingData | null) ?? {}
  const mergedOnboarding: OnboardingData & Record<string, unknown> = {
    ...existingOnboarding,
    // Honest placeholders for fields the mockup asks for but the DB does not expose.
    foundry_step_completed_at: new Date().toISOString(),
    foundry_self_role: role,
    foundry_hq_country: headquartersCountry,
    foundry_fiscal_year_start: fiscalYearStart,
  }

  const { error: onboardingError } = await supabase
    .from('profiles')
    .update({
      onboarding_data: mergedOnboarding as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (onboardingError) {
    console.warn('[foundry-onboarding] Failed to persist onboarding stamp:', {
      userId: user.id,
      error: onboardingError.message,
    })
  }

  // AUDIT
  console.info('[foundry-onboarding] Foundry saved:', {
    userId: user.id,
    foundryId,
    created: createdFoundry,
    tier,
    industry,
  })

  revalidatePath('/', 'layout')
  revalidatePath('/today')

  return { success: true, error: null, foundryId }
}
