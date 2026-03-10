'use server'

import { createClient } from '@/lib/supabase/server'

// ============================================================================
// TYPES
// ============================================================================

export interface EntityReview {
  id: string
  entity_type: string
  entity_name: string
  reviewer_name: string | null
  reviewer_role: string | null
  reviewer_company: string | null
  rating: number
  title: string | null
  body: string
  pros: string[]
  cons: string[]
  verified_purchase: boolean
  helpful_count: number
  created_at: string
}

export interface ReviewSummary {
  avg_rating: number
  total_count: number
  distribution: Record<number, number>
}

// ============================================================================
// GET REVIEWS FOR ENTITY
// ============================================================================

/**
 * Fetches reviews for a specific entity (component, supplier, listing, etc.).
 *
 * @description Queries entity_reviews by type and name, returns sorted reviews
 * plus an aggregated summary with rating distribution.
 *
 * @param {string} entityType - The entity type (e.g. 'component', 'supplier', 'marketplace_product')
 * @param {string} entityName - The entity name to match
 * @param {string} [sortBy='recent'] - Sort order: 'recent', 'highest', 'lowest', 'helpful'
 * @returns {Promise<{ reviews: EntityReview[]; summary: ReviewSummary } | { error: string }>}
 *
 * @security Requires authenticated user (RLS enforces)
 */
export async function getEntityReviews(
  entityType: string,
  entityName: string,
  sortBy: 'recent' | 'highest' | 'lowest' | 'helpful' = 'recent'
): Promise<{ reviews: EntityReview[]; summary: ReviewSummary } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  let query = supabase
    .from('entity_reviews')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_name', entityName)

  switch (sortBy) {
    case 'highest':
      query = query.order('rating', { ascending: false })
      break
    case 'lowest':
      query = query.order('rating', { ascending: true })
      break
    case 'helpful':
      query = query.order('helpful_count', { ascending: false })
      break
    default:
      query = query.order('created_at', { ascending: false })
  }

  query = query.limit(100)

  const { data, error } = await query

  if (error) {
    console.error('[Reviews] Failed to fetch reviews:', {
      entityType,
      entityName,
      error: error.message,
    })
    return { error: 'Failed to load reviews' }
  }

  const reviews: EntityReview[] = (data ?? []).map((r) => ({
    id: r.id,
    entity_type: r.entity_type,
    entity_name: r.entity_name,
    reviewer_name: r.reviewer_name,
    reviewer_role: r.reviewer_role,
    reviewer_company: r.reviewer_company,
    rating: r.rating,
    title: r.title,
    body: r.body,
    pros: (r.pros as string[]) ?? [],
    cons: (r.cons as string[]) ?? [],
    verified_purchase: r.verified_purchase ?? false,
    helpful_count: r.helpful_count ?? 0,
    created_at: r.created_at,
  }))

  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  let totalRating = 0
  for (const r of reviews) {
    distribution[r.rating] = (distribution[r.rating] ?? 0) + 1
    totalRating += r.rating
  }

  const summary: ReviewSummary = {
    avg_rating: reviews.length > 0 ? totalRating / reviews.length : 0,
    total_count: reviews.length,
    distribution,
  }

  return { reviews, summary }
}

// ============================================================================
// GET REVIEW SUMMARIES (BATCH)
// ============================================================================

/**
 * Fetches aggregated review summaries for multiple entities at once.
 * Used for card displays where we need avg rating + count without full reviews.
 *
 * @description Fetches all reviews matching the entity names, then aggregates
 * client-side. Efficient for card grids (avoids N+1 queries).
 *
 * @param {string} entityType - The entity type to filter by
 * @param {string[]} entityNames - Array of entity names to fetch summaries for
 * @returns {Promise<{ data: Map<string, { avg: number; count: number }> } | { error: string }>}
 *
 * @security Requires authenticated user (RLS enforces)
 */
export async function getReviewSummaries(
  entityType: string,
  entityNames: string[]
): Promise<{ data: Record<string, { avg: number; count: number }> } | { error: string }> {
  if (entityNames.length === 0) return { data: {} }
  // SECURITY: Cap batch size to prevent DoS via large .in() clauses
  if (entityNames.length > 200) return { error: 'Too many entity names (max 200)' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data, error } = await supabase
    .from('entity_reviews')
    .select('entity_name, rating')
    .eq('entity_type', entityType)
    .in('entity_name', entityNames)

  if (error) {
    console.error('[Reviews] Failed to fetch review summaries:', {
      entityType,
      count: entityNames.length,
      error: error.message,
    })
    return { error: 'Failed to load review summaries' }
  }

  const result: Record<string, { avg: number; count: number }> = {}
  const accumulator: Record<string, { total: number; count: number }> = {}

  for (const r of data ?? []) {
    const name = r.entity_name as string
    if (!accumulator[name]) {
      accumulator[name] = { total: 0, count: 0 }
    }
    accumulator[name].total += r.rating
    accumulator[name].count += 1
  }

  for (const [name, acc] of Object.entries(accumulator)) {
    result[name] = {
      avg: acc.count > 0 ? Math.round((acc.total / acc.count) * 10) / 10 : 0,
      count: acc.count,
    }
  }

  return { data: result }
}
