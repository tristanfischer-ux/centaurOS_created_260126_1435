import { createClient } from './server'

// Simple request-scoped cache using a Map keyed by user ID
const foundryCache = new Map<string, { foundryId: string; timestamp: number }>()
const CACHE_TTL = 60000 // 1 minute cache

export async function getFoundryIdCached(): Promise<string | null> {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Check cache
  const cached = foundryCache.get(user.id)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.foundryId
  }

  // First try metadata
  if (user.app_metadata.foundry_id) {
    foundryCache.set(user.id, {
      foundryId: user.app_metadata.foundry_id,
      timestamp: Date.now()
    })
    return user.app_metadata.foundry_id
  }

  // Fallback: Fetch from database
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('foundry_id')
    .eq('id', user.id)
    .single()

  if (error || !profile?.foundry_id) {
    return null
  }

  // Update cache
  foundryCache.set(user.id, {
    foundryId: profile.foundry_id,
    timestamp: Date.now()
  })

  return profile.foundry_id
}

export function clearFoundryCache(userId?: string) {
  if (userId) {
    foundryCache.delete(userId)
  } else {
    foundryCache.clear()
  }
}
