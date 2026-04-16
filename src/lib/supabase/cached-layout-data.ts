import { unstable_cache } from 'next/cache'
import { createAdminClient } from './admin'

import type { FoundryInfo } from './foundry-context'

/**
 * Cached layout data returned for the platform layout shell.
 *
 * @description Contains everything the Sidebar + layout chrome needs:
 * profile fields, foundry details, admin permissions, and multi-foundry
 * memberships. Cached for 60s per user to avoid 3-5 DB round-trips on
 * every page navigation.
 */
type UserRole = 'Founder' | 'Executive' | 'Apprentice' | 'AI_Agent' | 'Supplier'
type AccountType = 'team_builder' | 'supplier'

export interface CachedLayoutData {
  profile: {
    foundry_id: string | null
    active_foundry_id: string | null
    full_name: string | null
    role: UserRole | null
    account_type: AccountType | null
    onboarding_data: unknown
  } | null
  foundryName: string
  foundryId: string
  foundryLogoUrl: string | null
  foundryIsSandbox: boolean
  hasAdminAccess: boolean
  userFoundries: FoundryInfo[]
}

// INTENT: The platform layout runs 3-5 Supabase queries on every page
// navigation (profile, foundry memberships, foundry details, admin perms).
// This data rarely changes within a session. By caching it for 60s per user,
// navigating between pages only costs the auth check (~20ms) instead of
// 3-5 DB round-trips (~200-400ms).
//
// DECISION: Using the admin client (service role) instead of the cookie-based
// client because unstable_cache can revalidate during a different user's
// request. RLS would reject the query if user B's cookies triggered
// revalidation of user A's cache entry. The admin client bypasses RLS,
// which is safe here because auth is verified before this function is called.
const fetchLayoutData = async (userId: string): Promise<CachedLayoutData> => {
  const supabase = createAdminClient()

  const [profileResult, foundriesResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('foundry_id, active_foundry_id, full_name, role, account_type, onboarding_data, is_fractional_executive, is_supplier')
      .eq('id', userId)
      .single(),
    supabase
      .rpc('get_user_foundries', { p_user_id: userId }),
  ])

  const rawProfile = profileResult.data
  const profile = rawProfile ? {
    ...rawProfile,
    role: rawProfile.role as UserRole | null,
    account_type: rawProfile.account_type as AccountType | null,
  } : null
  const userFoundries: FoundryInfo[] = (foundriesResult.data ?? []).map((f: {
    foundry_id: string
    foundry_name: string
    role: string
    is_primary: boolean
    is_active: boolean
    member_count: number
    joined_at: string
    logo_url: string | null
    is_sandbox: boolean
  }) => ({
    foundryId: f.foundry_id,
    foundryName: f.foundry_name,
    role: f.role,
    isPrimary: f.is_primary,
    isActive: f.is_active,
    memberCount: Number(f.member_count),
    joinedAt: f.joined_at,
    logoUrl: f.logo_url || null,
    isSandbox: f.is_sandbox ?? false,
  }))

  let foundryName = 'Forge Foundry'
  let foundryId = 'Unknown'
  let foundryLogoUrl: string | null = null
  // eslint-disable-next-line prefer-const
  let foundryIsSandbox = false
  let hasAdminAccess = false

  if (profile?.foundry_id) {
    foundryId = profile.foundry_id

    const needsAdminCheck = profile.role !== 'Founder'

    const [foundryResult, adminPermResult] = await Promise.all([
      supabase
        .from('foundries')
        .select('name, logo_url, is_sandbox')
        .eq('id', profile.foundry_id)
        .maybeSingle(),
      needsAdminCheck
        ? supabase
            .from('foundry_admin_permissions')
            .select('id')
            .eq('foundry_id', profile.foundry_id)
            .eq('profile_id', userId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])

    if (foundryResult.data) {
      foundryName = foundryResult.data.name
      foundryLogoUrl = foundryResult.data.logo_url || null
      foundryIsSandbox = foundryResult.data.is_sandbox ?? false
    }

    hasAdminAccess = !!adminPermResult.data
  }

  return {
    profile,
    foundryName,
    foundryId,
    foundryLogoUrl,
    foundryIsSandbox,
    hasAdminAccess,
    userFoundries,
  }
}

/**
 * Get layout data for the platform shell, cached for 60 seconds per user.
 *
 * @description Wraps all layout-level Supabase queries (profile, foundry
 * memberships, foundry details, admin permissions) in a single cached call.
 * The caller must verify authentication BEFORE calling this function.
 *
 * @param userId - The authenticated user's ID (used as cache key)
 * @returns Cached layout data including profile, foundry info, and permissions
 */
export const getCachedLayoutData = unstable_cache(
  fetchLayoutData,
  ['platform-layout-data'],
  { revalidate: 60, tags: ['layout-data'] }
)
