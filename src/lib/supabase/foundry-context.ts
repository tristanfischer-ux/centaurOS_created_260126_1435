import { createClient } from './server'

// Simple request-scoped cache using a Map keyed by user ID
const foundryCache = new Map<string, { foundryId: string; timestamp: number }>()
const CACHE_TTL = 60000 // 1 minute cache
const MAX_CACHE_SIZE = 1000 // Prevent unbounded growth

// Cleanup old entries periodically
function cleanupCache() {
  const now = Date.now()
  const entriesToDelete: string[] = []
  
  for (const [userId, entry] of foundryCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL) {
      entriesToDelete.push(userId)
    }
  }
  
  entriesToDelete.forEach(userId => foundryCache.delete(userId))
  
  // If still too large, remove oldest entries
  if (foundryCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(foundryCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
    const toRemove = entries.slice(0, foundryCache.size - MAX_CACHE_SIZE)
    toRemove.forEach(([userId]) => foundryCache.delete(userId))
  }
}

// Run cleanup every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupCache, 5 * 60 * 1000)
}

/**
 * Get the user's currently active foundry ID.
 * Resolution order:
 * 1. profiles.active_foundry_id (explicitly selected workspace)
 * 2. Primary foundry from foundry_memberships
 * 3. Legacy profiles.foundry_id (backward compatibility)
 */
export async function getFoundryIdCached(): Promise<string | null> {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Check cache
  const cached = foundryCache.get(user.id)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.foundryId
  }

  // Fetch active foundry - prefers active_foundry_id, falls back to foundry_id
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('foundry_id, active_foundry_id')
    .eq('id', user.id)
    .single()

  if (error || !profile) {
    return null
  }

  const foundryId = profile.active_foundry_id || profile.foundry_id
  if (!foundryId) return null

  // Update cache (with size check)
  if (foundryCache.size >= MAX_CACHE_SIZE) {
    cleanupCache()
  }
  
  foundryCache.set(user.id, {
    foundryId,
    timestamp: Date.now()
  })

  return foundryId
}

export function clearFoundryCache(userId?: string) {
  if (userId) {
    foundryCache.delete(userId)
  } else {
    foundryCache.clear()
  }
}

/**
 * Get all foundries for the current user.
 *
 * @description Calls the get_user_foundries RPC which returns each foundry
 * the user belongs to, including name, role, member count, and logo URL.
 *
 * @returns Array of foundry info objects sorted by primary first, then join date
 */
export async function getUserFoundries(): Promise<Array<{
  foundryId: string
  foundryName: string
  role: string
  isPrimary: boolean
  isActive: boolean
  memberCount: number
  joinedAt: string
  logoUrl: string | null
}>> {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .rpc('get_user_foundries', { p_user_id: user.id })

  if (error || !data) {
    console.error('[FoundryContext] Failed to get user foundries:', error)
    return []
  }

  return data.map((f: {
    foundry_id: string
    foundry_name: string
    role: string
    is_primary: boolean
    is_active: boolean
    member_count: number
    joined_at: string
    logo_url: string | null
  }) => ({
    foundryId: f.foundry_id,
    foundryName: f.foundry_name,
    role: f.role,
    isPrimary: f.is_primary,
    isActive: f.is_active,
    memberCount: Number(f.member_count),
    joinedAt: f.joined_at,
    logoUrl: f.logo_url || null,
  }))
}
