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

export async function getFoundryIdCached(): Promise<string | null> {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Check cache
  const cached = foundryCache.get(user.id)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.foundryId
  }

  // Always fetch from database (never trust app_metadata which could be client-writable)
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('foundry_id')
    .eq('id', user.id)
    .single()

  if (error || !profile?.foundry_id) {
    return null
  }

  // Update cache (with size check)
  if (foundryCache.size >= MAX_CACHE_SIZE) {
    cleanupCache()
  }
  
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
